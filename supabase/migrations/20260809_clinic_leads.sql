-- =============================================================================
-- CRM da clinica: leads, pipeline e historico de estagio
-- =============================================================================
--
-- NAO APLICADA. Revisar no Supabase antes de executar.
--
-- O CRM nao e uma segunda tabela de pacientes: um lead pode nunca comparecer
-- nem virar paciente. Quando a conversao existir, `converted_patient_id` aponta
-- para o cadastro resultante sem apagar o historico comercial.
--
-- O app ja prepara a tela e o adapter, mas mantem o item do menu desabilitado
-- ate esta migration existir no banco remoto e os tipos serem regenerados.
-- =============================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_stage') then
    create type public.lead_stage as enum (
      'new',
      'contacted',
      'qualified',
      'scheduled',
      'showed',
      'converted',
      'lost'
    );
  end if;
end
$$;

create table if not exists public.clinic_leads (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,

  name text not null,
  phone text,
  email text,
  source text not null default 'manual',
  campaign text,
  interest text,
  stage public.lead_stage not null default 'new',
  potential_value_cents integer,
  next_action_at timestamptz,
  notes text,

  assigned_to uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  converted_patient_id uuid references public.patients(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clinic_leads_pipeline_idx
  on public.clinic_leads (clinic_id, stage, updated_at desc);

create index if not exists clinic_leads_assignee_idx
  on public.clinic_leads (clinic_id, assigned_to, stage);

create index if not exists clinic_leads_next_action_idx
  on public.clinic_leads (clinic_id, next_action_at)
  where next_action_at is not null;

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  lead_id uuid not null references public.clinic_leads(id) on delete cascade,
  from_stage public.lead_stage,
  to_stage public.lead_stage not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists lead_events_timeline_idx
  on public.lead_events (clinic_id, lead_id, created_at desc);

alter table public.clinic_leads enable row level security;
alter table public.lead_events enable row level security;

drop policy if exists "clinic_leads_select" on public.clinic_leads;
create policy "clinic_leads_select"
  on public.clinic_leads
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id());

drop policy if exists "clinic_leads_insert" on public.clinic_leads;
create policy "clinic_leads_insert"
  on public.clinic_leads
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id());

drop policy if exists "clinic_leads_update" on public.clinic_leads;
create policy "clinic_leads_update"
  on public.clinic_leads
  for update
  to authenticated
  using (clinic_id = public.current_clinic_id())
  with check (clinic_id = public.current_clinic_id());

drop policy if exists "lead_events_select" on public.lead_events;
create policy "lead_events_select"
  on public.lead_events
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id());

drop policy if exists "lead_events_insert" on public.lead_events;
create policy "lead_events_insert"
  on public.lead_events
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id());

-- Nao ha DELETE: perder um lead e uma decisao de negocio, nao limpeza tecnica.

commit;

-- Verificar depois de aplicar:
-- select relrowsecurity from pg_class where relname in ('clinic_leads','lead_events');
-- select policyname, tablename, cmd from pg_policies
--   where tablename in ('clinic_leads','lead_events');
-- Testar com duas clinicas: a clinica B nao deve ler nem inserir em A.
-- Depois: npm run db:types
