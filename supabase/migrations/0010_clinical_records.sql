-- =============================================================================
-- Focuss Care · Onda 2 (Núcleo clínico) · 0010 — Atendimento e prontuário
-- =============================================================================
-- SEPARAÇÃO CENTRAL:
--
--   encounters       = o ATENDIMENTO. Evento operacional, mutável.
--                      (abriu, está em curso, fechou)
--
--   medical_records  = o REGISTRO CLÍNICO. Imutável, com valor jurídico.
--                      Corrigir = criar nova versão apontando para a anterior.
--
-- Juntar os dois obriga a escolher entre "não consigo mudar o status do
-- atendimento" e "o prontuário é editável". As duas opções são ruins.
--
-- Res. CFM 1.821/2007 e o padrão SBIS-CFM exigem integridade e rastreabilidade
-- do prontuário eletrônico. Registro assinado não se edita e não se apaga.
-- =============================================================================

do $$ begin
  create type public.encounter_status as enum ('open','closed','canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.record_type as enum (
    'anamnesis',      -- anamnese
    'evolution',      -- evolução
    'physical_exam',  -- exame físico
    'diagnosis',      -- hipótese/diagnóstico
    'procedure',      -- procedimento realizado
    'exam_request',   -- solicitação de exame
    'referral',       -- encaminhamento
    'certificate',    -- atestado
    'note'            -- observação clínica livre
  );
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- encounters — o atendimento
-- -----------------------------------------------------------------------------
create table if not exists public.encounters (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  patient_id      uuid not null references public.patients(id) on delete restrict,
  professional_id uuid not null references public.professionals(id) on delete restrict,
  appointment_id  uuid references public.appointments(id) on delete set null,  -- null = encaixe

  status          public.encounter_status not null default 'open',
  chief_complaint text,                       -- queixa principal
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,

  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint encounters_time_order check (ended_at is null or ended_at >= started_at)
);

-- Um profissional não pode ter dois atendimentos abertos ao mesmo tempo.
create unique index if not exists encounters_one_open_per_professional_idx
  on public.encounters (professional_id) where status = 'open';

create index if not exists encounters_patient_idx
  on public.encounters (clinic_id, patient_id, started_at desc);
create index if not exists encounters_appointment_idx
  on public.encounters (clinic_id, appointment_id);

create trigger set_updated_at before update on public.encounters
  for each row execute function private.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- medical_records — IMUTÁVEL
-- -----------------------------------------------------------------------------
create table if not exists public.medical_records (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics(id) on delete cascade,
  patient_id    uuid not null references public.patients(id) on delete restrict,
  encounter_id  uuid references public.encounters(id) on delete restrict,

  -- Autoria: guardada mesmo com prontuário aberto a todos os profissionais.
  -- É o que permite endurecer a regra depois sem migrar dado.
  author_id     uuid not null references public.professionals(id) on delete restrict,
  author_user_id uuid references public.profiles(id) on delete set null,

  record_type   public.record_type not null,
  content       jsonb not null,
  content_text  text,                 -- projeção textual, para busca
  content_hash  text not null,        -- SHA-256 de content::text, para integridade

  -- Versionamento por sucessão. Corrigir = inserir nova linha apontando para a
  -- anterior. A linha antiga NUNCA muda.
  supersedes_id uuid references public.medical_records(id) on delete restrict,
  version       integer not null default 1,

  -- Assinatura digital (ICP-Brasil). Enquanto for null, a UI NÃO pode
  -- apresentar o documento como "assinado digitalmente".
  signed_at     timestamptz,
  signature     jsonb,

  created_at    timestamptz not null default now(),

  constraint medical_records_version_positive check (version > 0),
  constraint medical_records_supersede_bumps_version
    check (supersedes_id is null or version > 1)
);

create index if not exists medical_records_patient_idx
  on public.medical_records (clinic_id, patient_id, created_at desc);
create index if not exists medical_records_encounter_idx
  on public.medical_records (clinic_id, encounter_id);
create index if not exists medical_records_author_idx
  on public.medical_records (clinic_id, author_id, created_at desc);
create unique index if not exists medical_records_supersedes_uniq
  on public.medical_records (supersedes_id) where supersedes_id is not null;
create index if not exists medical_records_text_trgm_idx
  on public.medical_records using gin (content_text extensions.gin_trgm_ops);

-- Preenche o hash automaticamente. Adulteração direta no banco fica detectável.
create or replace function private.tg_medical_record_hash()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.content_hash := encode(extensions.digest(new.content::text, 'sha256'), 'hex');
  return new;
end;
$$;

create trigger medical_records_hash_trg
  before insert on public.medical_records
  for each row execute function private.tg_medical_record_hash();

-- ★ A imutabilidade, com dentes. Não é convenção: o banco recusa.
create or replace function private.tg_forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Registro clínico é imutável. Para corrigir, insira nova versão com supersedes_id apontando para %.',
    old.id
    using errcode = '42501';
end;
$$;

create trigger medical_records_immutable_trg
  before update or delete on public.medical_records
  for each row execute function private.tg_forbid_mutation();

comment on table public.medical_records is
  'Append-only real: UPDATE e DELETE são bloqueados por gatilho, inclusive para o dono da tabela.';

-- Versão vigente de cada registro: aquela que ninguém substituiu.
-- Evita precisar de um UPDATE para marcar "superseded".
create or replace view public.v_medical_records_current as
select r.*
from public.medical_records r
where not exists (
  select 1 from public.medical_records s where s.supersedes_id = r.id
);

comment on view public.v_medical_records_current is
  'Somente as versões vigentes. A view herda a RLS da tabela base (security_invoker).';

alter view public.v_medical_records_current set (security_invoker = on);

-- -----------------------------------------------------------------------------
-- vitals — sinais vitais (série temporal, ligada ao atendimento)
-- -----------------------------------------------------------------------------
create table if not exists public.vitals (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics(id) on delete cascade,
  patient_id     uuid not null references public.patients(id) on delete cascade,
  encounter_id   uuid references public.encounters(id) on delete set null,
  measured_at    timestamptz not null default now(),
  weight_kg      numeric(5,2),
  height_cm      numeric(5,1),
  systolic_bp    smallint,
  diastolic_bp   smallint,
  heart_rate     smallint,
  respiratory_rate smallint,
  temperature_c  numeric(4,1),
  spo2           smallint,
  glucose_mgdl   smallint,
  notes          text,
  recorded_by    uuid references public.profiles(id) on delete set null,

  constraint vitals_bp_order check (
    systolic_bp is null or diastolic_bp is null or systolic_bp >= diastolic_bp
  ),
  constraint vitals_spo2_range check (spo2 is null or spo2 between 0 and 100)
);

create index if not exists vitals_patient_idx
  on public.vitals (clinic_id, patient_id, measured_at desc);

-- -----------------------------------------------------------------------------
-- allergies — alerta persistente, não fica preso a um atendimento
-- -----------------------------------------------------------------------------
create table if not exists public.allergies (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  substance    text not null,
  reaction     text,
  severity     smallint,                 -- 1 leve … 5 anafilaxia
  is_active    boolean not null default true,
  recorded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),

  constraint allergies_severity_range check (severity is null or severity between 1 and 5)
);

create index if not exists allergies_patient_idx
  on public.allergies (clinic_id, patient_id) where is_active;

comment on table public.allergies is
  'Alergia é transversal ao atendimento e precisa aparecer como alerta em qualquer tela de prescrição.';

-- -----------------------------------------------------------------------------
-- prescriptions — estruturado, e não texto livre
-- -----------------------------------------------------------------------------
create table if not exists public.prescriptions (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics(id) on delete cascade,
  patient_id     uuid not null references public.patients(id) on delete restrict,
  encounter_id   uuid references public.encounters(id) on delete restrict,
  author_id      uuid not null references public.professionals(id) on delete restrict,
  issued_at      timestamptz not null default now(),
  valid_until    date,
  external_id    text,                   -- id no emissor externo (ex.: Memed)
  external_url   text,
  signed_at      timestamptz,
  signature      jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists prescriptions_patient_idx
  on public.prescriptions (clinic_id, patient_id, issued_at desc);

create trigger prescriptions_immutable_trg
  before update or delete on public.prescriptions
  for each row execute function private.tg_forbid_mutation();

create table if not exists public.prescription_items (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  drug_name       text not null,
  dosage          text,
  route           text,                  -- via de administração
  frequency       text,
  duration        text,
  quantity        text,
  instructions    text,
  sort_order      smallint not null default 0
);

create index if not exists prescription_items_idx
  on public.prescription_items (clinic_id, prescription_id, sort_order);

-- -----------------------------------------------------------------------------
-- clinical_attachments — exames, imagens, laudos
-- -----------------------------------------------------------------------------
create table if not exists public.clinical_attachments (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references public.clinics(id) on delete cascade,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  encounter_id uuid references public.encounters(id) on delete set null,
  record_id    uuid references public.medical_records(id) on delete set null,
  title        text not null,
  description  text,
  storage_path text not null,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),

  constraint clinical_attachments_path_scoped
    check (storage_path like ('clinic/' || clinic_id::text || '/%'))
);

create index if not exists clinical_attachments_patient_idx
  on public.clinical_attachments (clinic_id, patient_id, created_at desc);
