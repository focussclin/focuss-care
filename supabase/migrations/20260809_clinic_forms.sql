-- =============================================================================
-- Formulários digitais da clínica: modelos versionáveis e respostas futuras
-- =============================================================================
--
-- NAO APLICADA. Revisar no Supabase antes de executar.
--
-- Esta migration separa o modelo do formulário das respostas. A coluna `fields`
-- guarda apenas a definição validada pela aplicação; respostas e dados de saúde
-- terão policies e auditoria próprias quando a coleta for ativada.
-- =============================================================================

begin;

create table if not exists public.clinic_forms (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,

  name text not null,
  description text,
  form_type text not null default 'custom'
    check (form_type in ('intake', 'anamnesis', 'consent', 'feedback', 'custom')),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  fields jsonb not null default '[]'::jsonb,
  version integer not null default 1 check (version > 0),

  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, clinic_id)
);

create index if not exists clinic_forms_list_idx
  on public.clinic_forms (clinic_id, status, updated_at desc);

-- As chaves compostas abaixo tornam o tenant parte da referência futura de
-- respostas. `id` já é único, portanto os índices não mudam a cardinalidade;
-- apenas permitem ao Postgres impedir uma referência cruzada.
create unique index if not exists patients_id_clinic_id_key
  on public.patients (id, clinic_id);

create unique index if not exists appointments_id_clinic_id_key
  on public.appointments (id, clinic_id);

create table if not exists public.clinic_form_responses (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  form_id uuid not null,
  patient_id uuid not null,
  appointment_id uuid,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'void')),
  answers jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  foreign key (form_id, clinic_id)
    references public.clinic_forms(id, clinic_id)
    on delete restrict,
  foreign key (patient_id, clinic_id)
    references public.patients(id, clinic_id)
    on delete restrict,
  foreign key (appointment_id, clinic_id)
    references public.appointments(id, clinic_id)
    on delete restrict
);

create index if not exists clinic_form_responses_patient_idx
  on public.clinic_form_responses (clinic_id, patient_id, created_at desc);

create index if not exists clinic_form_responses_form_idx
  on public.clinic_form_responses (clinic_id, form_id, status, created_at desc);

alter table public.clinic_forms enable row level security;
alter table public.clinic_form_responses enable row level security;

drop policy if exists "clinic_forms_select" on public.clinic_forms;
create policy "clinic_forms_select"
  on public.clinic_forms
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'professional', 'receptionist']::membership_role[]
    ));

drop policy if exists "clinic_forms_insert" on public.clinic_forms;
create policy "clinic_forms_insert"
  on public.clinic_forms
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(array['owner', 'admin']::membership_role[]));

drop policy if exists "clinic_forms_update" on public.clinic_forms;
create policy "clinic_forms_update"
  on public.clinic_forms
  for update
  to authenticated
  using (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(array['owner', 'admin']::membership_role[]))
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(array['owner', 'admin']::membership_role[]));

drop policy if exists "clinic_form_responses_select" on public.clinic_form_responses;
create policy "clinic_form_responses_select"
  on public.clinic_form_responses
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'professional', 'receptionist']::membership_role[]
    ));

drop policy if exists "clinic_form_responses_insert" on public.clinic_form_responses;
create policy "clinic_form_responses_insert"
  on public.clinic_form_responses
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'professional', 'receptionist']::membership_role[]
    ));

drop policy if exists "clinic_form_responses_update" on public.clinic_form_responses;
create policy "clinic_form_responses_update"
  on public.clinic_form_responses
  for update
  to authenticated
  using (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'professional', 'receptionist']::membership_role[]
    ))
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'professional', 'receptionist']::membership_role[]
    ));

commit;

-- Verificar depois de aplicar:
-- select relrowsecurity from pg_class
--   where relname in ('clinic_forms', 'clinic_form_responses');
-- select policyname, tablename, cmd from pg_policies
--   where tablename in ('clinic_forms', 'clinic_form_responses');
-- Testar com duas clinicas: a clinica B nao deve ler nem inserir em A.
-- Depois: npm run db:types
