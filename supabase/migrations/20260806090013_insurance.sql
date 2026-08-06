-- =============================================================================
-- Focuss Care · Onda 3 (Financeiro) · 0013 — Convênios
-- =============================================================================
-- Operadora (Unimed) → Plano (Unimed Nacional Apartamento) → Carteirinha do
-- paciente → Guia de autorização.
--
-- Cada plano aponta para uma price_list própria: o mesmo procedimento custa
-- valores diferentes conforme o convênio, e o repasse ao profissional também
-- muda. Modelar isso como "um preço por serviço" é o erro que obriga a
-- refazer o financeiro seis meses depois.
-- =============================================================================

do $$ begin
  create type public.authorization_status as enum
    ('requested','approved','denied','expired','used','canceled');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- insurance_providers — a operadora
-- -----------------------------------------------------------------------------
create table if not exists public.insurance_providers (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  name       text not null,
  ans_code   text,                    -- registro na ANS
  cnpj       text,
  contact    jsonb not null default '{}'::jsonb,
  notes      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (clinic_id, name),
  constraint insurance_providers_cnpj_digits check (cnpj is null or cnpj ~ '^[0-9]{14}$')
);

create trigger set_updated_at before update on public.insurance_providers
  for each row execute function private.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- insurance_plans — o plano dentro da operadora
-- -----------------------------------------------------------------------------
create table if not exists public.insurance_plans (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics(id) on delete cascade,
  provider_id    uuid not null references public.insurance_providers(id) on delete cascade,
  name           text not null,
  plan_code      text,
  price_list_id  uuid references public.price_lists(id) on delete set null,
  copay_cents    integer not null default 0,      -- coparticipação fixa
  payment_term_days smallint not null default 30, -- prazo de repasse da operadora
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (clinic_id, provider_id, name),
  constraint insurance_plans_copay_non_negative check (copay_cents >= 0)
);

create index if not exists insurance_plans_provider_idx
  on public.insurance_plans (clinic_id, provider_id) where is_active;

create trigger set_updated_at before update on public.insurance_plans
  for each row execute function private.tg_set_updated_at();

comment on column public.insurance_plans.payment_term_days is
  'Convênio paga em D+N. Alimenta a projeção de fluxo de caixa — sem isso o "a receber" fica irreal.';

-- -----------------------------------------------------------------------------
-- patient_insurances — a carteirinha do paciente
-- -----------------------------------------------------------------------------
create table if not exists public.patient_insurances (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references public.clinics(id) on delete cascade,
  patient_id        uuid not null references public.patients(id) on delete cascade,
  insurance_plan_id uuid not null references public.insurance_plans(id) on delete restrict,
  card_number       text not null,
  holder_name       text,                  -- titular, quando o paciente é dependente
  valid_until       date,
  is_primary        boolean not null default true,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (clinic_id, patient_id, insurance_plan_id)
);

create unique index if not exists patient_insurances_single_primary_idx
  on public.patient_insurances (clinic_id, patient_id) where is_primary and is_active;

create index if not exists patient_insurances_patient_idx
  on public.patient_insurances (clinic_id, patient_id) where is_active;

create trigger set_updated_at before update on public.patient_insurances
  for each row execute function private.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- insurance_authorizations — a guia
-- -----------------------------------------------------------------------------
create table if not exists public.insurance_authorizations (
  id                   uuid primary key default gen_random_uuid(),
  clinic_id            uuid not null references public.clinics(id) on delete cascade,
  patient_id           uuid not null references public.patients(id) on delete restrict,
  patient_insurance_id uuid not null references public.patient_insurances(id) on delete restrict,
  appointment_id       uuid references public.appointments(id) on delete set null,
  authorization_number text,
  status               public.authorization_status not null default 'requested',
  procedures           jsonb not null default '[]'::jsonb,  -- [{tuss_code, qty}]
  requested_at         timestamptz not null default now(),
  answered_at          timestamptz,
  expires_at           date,
  denial_reason        text,
  notes                text,
  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists insurance_authorizations_patient_idx
  on public.insurance_authorizations (clinic_id, patient_id, requested_at desc);
create index if not exists insurance_authorizations_pending_idx
  on public.insurance_authorizations (clinic_id, status, expires_at)
  where status in ('requested','approved');

create trigger set_updated_at before update on public.insurance_authorizations
  for each row execute function private.tg_set_updated_at();

comment on table public.insurance_authorizations is
  'Guia negada ou vencida vira atendimento não faturável. A tela de agenda precisa alertar ANTES do atendimento, não depois.';
