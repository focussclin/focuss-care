-- =============================================================================
-- Focuss Care · Onda 2 (Núcleo clínico) · 0008 — Pacientes
-- =============================================================================
-- DECISÃO ESTRUTURAL: paciente é isolado por clínica.
--   UNIQUE (clinic_id, cpf)   e nunca   UNIQUE (cpf)
-- O mesmo CPF atendido em duas clínicas gera dois registros independentes.
-- Cadastro global permitiria a Clínica A descobrir que o paciente também é
-- atendido na Clínica B — vazamento de dado sensível entre controladores
-- distintos. Ver docs/02-banco-de-dados.md §2.1.
-- =============================================================================

do $$ begin
  create type public.biological_sex as enum ('female','male','intersex','not_informed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.patient_document_kind as enum
    ('rg','cpf','cns','passport','insurance_card','consent_form','other');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- patients
-- -----------------------------------------------------------------------------
create table if not exists public.patients (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,

  full_name       text not null,
  social_name     text,                       -- nome social; a UI deve preferi-lo ao full_name
  birth_date      date,
  biological_sex  public.biological_sex not null default 'not_informed',
  gender_identity text,

  cpf             text,
  cns             text,                       -- Cartão Nacional de Saúde
  phone           text,
  phone_alt       text,
  email           extensions.citext,

  address         jsonb not null default '{}'::jsonb,
  emergency_contact jsonb,

  photo_url       text,
  admin_notes     text,                       -- observação ADMINISTRATIVA. Nunca clínica.

  is_active       boolean not null default true,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  unique (clinic_id, cpf),
  constraint patients_cpf_digits  check (cpf is null or cpf ~ '^[0-9]{11}$'),
  constraint patients_cns_digits  check (cns is null or cns ~ '^[0-9]{15}$'),
  constraint patients_birth_sane  check (birth_date is null or birth_date between '1900-01-01' and current_date)
);

comment on column public.patients.admin_notes is
  'Recado de recepção ("prefere manhã", "cadeirante"). Conteúdo clínico vai em medical_records — a recepção lê esta coluna.';
comment on column public.patients.social_name is
  'Nome social. Quando presente, é o nome exibido em telas, etiquetas e chamadas.';

create trigger set_updated_at before update on public.patients
  for each row execute function private.tg_set_updated_at();

-- Índices: sempre começando por clinic_id.
create index if not exists patients_clinic_active_idx
  on public.patients (clinic_id) where deleted_at is null and is_active;

-- Busca por nome com tolerância a erro de digitação e acento.
create index if not exists patients_name_trgm_idx
  on public.patients using gin (
    (coalesce(social_name, '') || ' ' || full_name) extensions.gin_trgm_ops
  );

create index if not exists patients_cpf_idx   on public.patients (clinic_id, cpf)   where cpf is not null;
create index if not exists patients_phone_idx on public.patients (clinic_id, phone) where phone is not null;
create index if not exists patients_birth_idx on public.patients (clinic_id, birth_date);

-- -----------------------------------------------------------------------------
-- patient_contacts — responsável legal, acompanhante, contato secundário
-- -----------------------------------------------------------------------------
create table if not exists public.patient_contacts (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  name         text not null,
  relationship text,                    -- 'mãe', 'responsável legal', 'cuidador'
  phone        text,
  email        extensions.citext,
  is_legal_guardian boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists patient_contacts_patient_idx
  on public.patient_contacts (clinic_id, patient_id);

create trigger set_updated_at before update on public.patient_contacts
  for each row execute function private.tg_set_updated_at();

comment on column public.patient_contacts.is_legal_guardian is
  'Paciente menor de idade ou interditado: consentimento e assinatura são do responsável.';

-- -----------------------------------------------------------------------------
-- patient_documents — documentos administrativos (não é anexo clínico)
-- -----------------------------------------------------------------------------
create table if not exists public.patient_documents (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  kind        public.patient_document_kind not null,
  storage_path text not null,           -- clinic/{clinic_id}/patient/{patient_id}/...
  file_name   text not null,
  mime_type   text,
  size_bytes  bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),

  constraint patient_documents_path_scoped
    check (storage_path like ('clinic/' || clinic_id::text || '/%'))
);

create index if not exists patient_documents_patient_idx
  on public.patient_documents (clinic_id, patient_id, created_at desc);

comment on constraint patient_documents_path_scoped on public.patient_documents is
  'O caminho no Storage precisa começar pelo clinic_id. Bug de aplicação não consegue gravar arquivo de um tenant na pasta de outro.';
