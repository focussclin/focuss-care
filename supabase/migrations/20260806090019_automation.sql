-- =============================================================================
-- Focuss Care · Onda 4 (Operação e IA) · 0019 — Automações
-- =============================================================================
-- Motor simples de propósito: gatilho + condições + ações, tudo declarativo em
-- jsonb. Nada de linguagem de script no banco — automação de clínica é
-- "lembrar consulta em D-1", não Turing completa.
-- =============================================================================

do $$ begin
  create type public.workflow_trigger as enum (
    'appointment_created',
    'appointment_confirmed',
    'appointment_reminder',     -- N horas antes
    'appointment_no_show',
    'encounter_finished',
    'invoice_issued',
    'invoice_overdue',
    'patient_birthday',
    'schedule'                  -- cron
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.workflow_run_status as enum ('pending','running','succeeded','failed','skipped');
exception when duplicate_object then null; end $$;

create table if not exists public.workflows (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics(id) on delete cascade,
  name           text not null,
  description    text,
  trigger_type   public.workflow_trigger not null,
  trigger_config jsonb not null default '{}'::jsonb,   -- {hours_before: 24} | {cron: "0 8 * * *"}
  conditions     jsonb not null default '[]'::jsonb,   -- [{field, op, value}]
  actions        jsonb not null default '[]'::jsonb,   -- [{type: 'whatsapp', template_id, ...}]
  is_active      boolean not null default true,
  last_run_at    timestamptz,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (clinic_id, name),
  constraint workflows_actions_not_empty check (jsonb_array_length(actions) > 0)
);

create index if not exists workflows_active_idx
  on public.workflows (clinic_id, trigger_type) where is_active;

create trigger set_updated_at before update on public.workflows
  for each row execute function private.tg_set_updated_at();

create table if not exists public.workflow_runs (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  workflow_id     uuid not null references public.workflows(id) on delete cascade,
  status          public.workflow_run_status not null default 'pending',
  trigger_payload jsonb not null default '{}'::jsonb,
  result          jsonb,
  error           text,
  attempt         smallint not null default 1,
  dedupe_key      text,                  -- evita disparar duas vezes pelo mesmo fato
  started_at      timestamptz,
  finished_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists workflow_runs_workflow_idx
  on public.workflow_runs (clinic_id, workflow_id, created_at desc);
create index if not exists workflow_runs_pending_idx
  on public.workflow_runs (clinic_id, status, created_at) where status in ('pending','running');
create unique index if not exists workflow_runs_dedupe_idx
  on public.workflow_runs (clinic_id, workflow_id, dedupe_key) where dedupe_key is not null;

comment on index public.workflow_runs_dedupe_idx is
  'Chave de deduplicação: "lembrete da consulta X" só dispara uma vez, mesmo que o worker rode duas vezes. Paciente recebendo o mesmo lembrete três vezes é o jeito mais rápido de virar bloqueio no WhatsApp.';
