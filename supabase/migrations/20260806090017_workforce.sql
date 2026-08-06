-- =============================================================================
-- Focuss Care · Onda 4 (Operação e IA) · 0017 — Funcionários e escalas
-- =============================================================================
-- `employees` é o vínculo TRABALHISTA. `professionals` é o vínculo ASSISTENCIAL.
-- Uma recepcionista é employee e não é professional. Um médico PJ que atende
-- por repasse é professional e pode não ser employee. Muitos são os dois.
-- Fundir as duas tabelas obriga a inventar campos nulos para metade dos casos.
-- =============================================================================

do $$ begin
  create type public.contract_type as enum ('clt','pj','autonomo','estagio','temporario');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.time_off_kind as enum
    ('ferias','atestado','folga','licenca','falta','banco_horas');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.time_off_status as enum ('requested','approved','denied','canceled');
exception when duplicate_object then null; end $$;

create table if not exists public.employees (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references public.clinics(id) on delete cascade,
  user_id          uuid references public.profiles(id)      on delete set null,
  professional_id  uuid references public.professionals(id) on delete set null,

  full_name        text not null,
  role_title       text,                       -- 'Recepcionista', 'Auxiliar', 'Gerente'
  cpf              text,
  contract_type    public.contract_type not null default 'clt',
  hire_date        date,
  termination_date date,
  salary_cents     integer,
  notes            text,

  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (clinic_id, cpf),
  constraint employees_cpf_digits  check (cpf is null or cpf ~ '^[0-9]{11}$'),
  constraint employees_salary_non_negative check (salary_cents is null or salary_cents >= 0),
  constraint employees_date_order  check (termination_date is null or hire_date is null
                                          or termination_date >= hire_date)
);

create index if not exists employees_clinic_active_idx
  on public.employees (clinic_id) where is_active;

create trigger set_updated_at before update on public.employees
  for each row execute function private.tg_set_updated_at();

comment on column public.employees.salary_cents is
  'Dado sensível de RH. A policy restringe a owner/admin — nem financeiro comum enxerga.';

create table if not exists public.work_schedules (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  weekday     smallint not null,
  start_time  time not null,
  end_time    time not null,
  created_at  timestamptz not null default now(),

  constraint work_schedules_weekday_range check (weekday between 0 and 6),
  constraint work_schedules_time_order    check (end_time > start_time)
);

create index if not exists work_schedules_employee_idx
  on public.work_schedules (clinic_id, employee_id, weekday);

create table if not exists public.time_off (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind        public.time_off_kind not null,
  status      public.time_off_status not null default 'requested',
  starts_on   date not null,
  ends_on     date not null,
  reason      text,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint time_off_date_order check (ends_on >= starts_on)
);

create index if not exists time_off_period_idx
  on public.time_off (clinic_id, starts_on, ends_on) where status = 'approved';

create trigger set_updated_at before update on public.time_off
  for each row execute function private.tg_set_updated_at();
