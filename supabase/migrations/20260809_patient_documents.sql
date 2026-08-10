-- =============================================================================
-- Documentos de pacientes: metadados tenant-scoped + Storage privado
-- =============================================================================
--
-- NAO APLICADA. Revisar no Supabase antes de executar.
--
-- ATENCAO — a tabela JA EXISTE no schema remoto (conferido em 09/08/2026 em
-- `database.types.ts`, gerado do projeto). O `create table if not exists`
-- abaixo e, portanto, um NO-OP: as colunas ja estao la e batem com as daqui.
--
-- O que este arquivo efetivamente aplica sobre uma tabela existente:
--
--   * as POLICIES, que SUBSTITUEM as atuais — confira antes o que existe:
--       select policyname, cmd from pg_policies
--        where tablename = 'patient_documents';
--   * os indices;
--   * as policies de `storage.objects`.
--
-- O que ele NAO aplica, justamente por a tabela ja existir: as constraints
-- declaradas no corpo do `create table` (`storage_path unique` e
-- `unique (id, clinic_id)`). Se elas forem necessarias, precisam virar
-- `alter table ... add constraint` proprios.
--
-- O bucket `patient-documents` foi criado em 09/08/2026 — privado, limite de
-- 20 MB, aceitando PDF e imagem. As policies de Storage abaixo dependem dele.
--
-- O arquivo armazenado nunca fica público. A aplicação só entrega uma URL
-- assinada por 60 segundos depois de localizar o metadado dentro da clínica
-- ativa. O caminho começa com clinic_id para que a policy do Storage tenha a
-- mesma fronteira tenant-scoped da tabela.
-- =============================================================================

begin;

create table if not exists public.patient_documents (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete restrict,
  kind text not null check (kind in (
    'rg', 'cpf', 'cns', 'passport', 'insurance_card', 'consent_form', 'other'
  )),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 180),
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes > 0),
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (id, clinic_id)
);

create index if not exists patient_documents_list_idx
  on public.patient_documents (clinic_id, created_at desc);

create index if not exists patient_documents_patient_idx
  on public.patient_documents (clinic_id, patient_id, created_at desc);

-- A policy tenant-scoped sozinha não impede que um id de paciente de outra
-- clínica seja anexado a uma linha nova. A chave composta fecha essa fronteira
-- também no banco, inclusive para futuros adapters que não passem pela UI.
create unique index if not exists patients_id_clinic_id_key
  on public.patients (id, clinic_id);

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'patient_documents_patient_clinic_fkey'
       and conrelid = 'public.patient_documents'::regclass
  ) then
    alter table public.patient_documents
      add constraint patient_documents_patient_clinic_fkey
      foreign key (patient_id, clinic_id)
      references public.patients (id, clinic_id)
      on delete restrict;
  end if;
end
$$;

alter table public.patient_documents enable row level security;

drop policy if exists "patient_documents_select" on public.patient_documents;
create policy "patient_documents_select"
  on public.patient_documents
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id());

drop policy if exists "patient_documents_insert" on public.patient_documents;
create policy "patient_documents_insert"
  on public.patient_documents
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id());

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'patient-documents',
  'patient-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "patient_documents_storage_select" on storage.objects;
create policy "patient_documents_storage_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = public.current_clinic_id()::text
  );

drop policy if exists "patient_documents_storage_insert" on storage.objects;
create policy "patient_documents_storage_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'patient-documents'
    and (storage.foldername(name))[1] = public.current_clinic_id()::text
  );

commit;

-- Verificar depois de aplicar:
-- select relrowsecurity from pg_class where relname = 'patient_documents';
-- select policyname, tablename, cmd from pg_policies
--   where tablename = 'patient_documents';
-- select id, name, public, file_size_limit from storage.buckets
--   where id = 'patient-documents';
-- Depois: npm run db:types
