-- =============================================================================
-- Focuss Care · Onda 2 (Núcleo clínico) · 0009 — Agenda
-- =============================================================================
-- A regra "não pode haver dois agendamentos no mesmo horário do mesmo
-- profissional" mora no BANCO, via EXCLUDE USING gist — não na aplicação.
--
-- Validar isso em JavaScript é uma corrida: dois atendentes clicando ao mesmo
-- tempo passam os dois pelo `select ... where horario_livre`, e você tem
-- overbooking. O Postgres recusa o segundo INSERT, sempre, sem exceção.
-- =============================================================================

do $$ begin
  create type public.appointment_status as enum (
    'scheduled',    -- criado
    'confirmed',    -- paciente confirmou
    'checked_in',   -- chegou à recepção
    'in_progress',  -- em atendimento
    'completed',
    'canceled',
    'no_show'       -- faltou
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.availability_kind as enum ('block','extra');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.queue_status as enum ('waiting','called','in_service','done','abandoned');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- availability_rules — janelas semanais recorrentes de atendimento
-- -----------------------------------------------------------------------------
create table if not exists public.availability_rules (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  weekday         smallint not null,          -- 0 = domingo … 6 = sábado
  start_time      time not null,
  end_time        time not null,
  slot_minutes    smallint,                   -- null = usa professionals.default_slot_minutes
  valid_from      date,
  valid_until     date,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint availability_weekday_range check (weekday between 0 and 6),
  constraint availability_time_order    check (end_time > start_time),
  constraint availability_slot_range    check (slot_minutes is null or slot_minutes between 5 and 480),
  constraint availability_date_order    check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

create index if not exists availability_rules_prof_idx
  on public.availability_rules (clinic_id, professional_id, weekday) where is_active;

create trigger set_updated_at before update on public.availability_rules
  for each row execute function private.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- availability_exceptions — férias, feriado, plantão extra
-- -----------------------------------------------------------------------------
create table if not exists public.availability_exceptions (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  professional_id uuid references public.professionals(id) on delete cascade, -- null = clínica inteira
  kind            public.availability_kind not null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  reason          text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint availability_exception_order check (ends_at > starts_at)
);

create index if not exists availability_exceptions_window_idx
  on public.availability_exceptions (clinic_id, professional_id, starts_at, ends_at);

-- -----------------------------------------------------------------------------
-- appointments
-- -----------------------------------------------------------------------------
create table if not exists public.appointments (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  patient_id      uuid not null references public.patients(id)      on delete restrict,
  professional_id uuid not null references public.professionals(id) on delete restrict,

  status          public.appointment_status not null default 'scheduled',
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,

  reason          text,                       -- motivo declarado no agendamento
  internal_notes  text,                       -- recado da recepção. NÃO é conteúdo clínico.
  is_walk_in      boolean not null default false,   -- encaixe

  confirmed_at    timestamptz,
  checked_in_at   timestamptz,
  canceled_at     timestamptz,
  cancel_reason   text,

  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint appointments_time_order check (ends_at > starts_at),
  constraint appointments_duration_sane
    check (ends_at - starts_at between interval '5 minutes' and interval '12 hours'),

  -- ★ A trava de sobreposição. Agendamentos cancelados e faltas liberam o
  --   horário; qualquer outro status ocupa.
  constraint appointments_no_overlap exclude using gist (
    clinic_id       with =,
    professional_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status not in ('canceled', 'no_show'))
);

comment on constraint appointments_no_overlap on public.appointments is
  'Impede overbooking no nível do banco. Duas requisições simultâneas: uma passa, a outra recebe erro 23P01 — trate na aplicação como "horário acabou de ser ocupado".';

create index if not exists appointments_agenda_idx
  on public.appointments (clinic_id, professional_id, starts_at);
create index if not exists appointments_day_idx
  on public.appointments (clinic_id, starts_at) where status not in ('canceled','no_show');
create index if not exists appointments_patient_idx
  on public.appointments (clinic_id, patient_id, starts_at desc);

create trigger set_updated_at before update on public.appointments
  for each row execute function private.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- appointment_status_history — quem mudou o quê, quando
-- -----------------------------------------------------------------------------
create table if not exists public.appointment_status_history (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  from_status    public.appointment_status,
  to_status      public.appointment_status not null,
  changed_by     uuid references public.profiles(id) on delete set null,
  reason         text,
  changed_at     timestamptz not null default now()
);

create index if not exists appointment_status_history_idx
  on public.appointment_status_history (clinic_id, appointment_id, changed_at desc);

create or replace function private.tg_appointment_status_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or old.status is distinct from new.status then
    insert into public.appointment_status_history
      (clinic_id, appointment_id, from_status, to_status, changed_by)
    values
      (new.clinic_id, new.id,
       case when tg_op = 'UPDATE' then old.status end,
       new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger appointment_status_history_trg
  after insert or update of status on public.appointments
  for each row execute function private.tg_appointment_status_history();

-- -----------------------------------------------------------------------------
-- waiting_queue — sala de espera / fila de urgência
-- -----------------------------------------------------------------------------
create table if not exists public.waiting_queue (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  patient_id      uuid not null references public.patients(id) on delete cascade,
  appointment_id  uuid references public.appointments(id) on delete set null,
  professional_id uuid references public.professionals(id) on delete set null,
  priority        smallint not null default 3,   -- 1 = emergência … 5 = eletivo
  status          public.queue_status not null default 'waiting',
  reason          text,
  arrived_at      timestamptz not null default now(),
  called_at       timestamptz,
  started_at      timestamptz,
  finished_at     timestamptz,

  constraint waiting_queue_priority_range check (priority between 1 and 5)
);

-- Ordem da fila: prioridade primeiro, chegada depois.
create index if not exists waiting_queue_active_idx
  on public.waiting_queue (clinic_id, priority, arrived_at)
  where status in ('waiting','called');

comment on column public.waiting_queue.priority is
  '1=emergência, 2=urgência, 3=pouco urgente, 4=pouco urgente, 5=não urgente (inspirado no Protocolo de Manchester). Ordenar por arrived_at sem considerar priority é o bug clássico de fila clínica.';
