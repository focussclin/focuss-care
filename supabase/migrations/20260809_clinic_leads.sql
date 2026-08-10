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
  using (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'professional', 'receptionist']::membership_role[]
    ));

drop policy if exists "clinic_leads_insert" on public.clinic_leads;
create policy "clinic_leads_insert"
  on public.clinic_leads
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'professional', 'receptionist']::membership_role[]
    ));

drop policy if exists "clinic_leads_update" on public.clinic_leads;
create policy "clinic_leads_update"
  on public.clinic_leads
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

drop policy if exists "lead_events_select" on public.lead_events;
create policy "lead_events_select"
  on public.lead_events
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'professional', 'receptionist']::membership_role[]
    ));

drop policy if exists "lead_events_insert" on public.lead_events;
create policy "lead_events_insert"
  on public.lead_events
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'professional', 'receptionist']::membership_role[]
    ));

-- Nao ha DELETE: perder um lead e uma decisao de negocio, nao limpeza tecnica.

-- ---------------------------------------------------------------------------
-- Conversao: o lead vira PACIENTE
-- ---------------------------------------------------------------------------
--
-- # Por que isto e funcao, e nao tres chamadas da aplicacao
--
-- Converter faz tres escritas que precisam valer JUNTAS:
--
--   1. cria a linha em `patients`;
--   2. marca o lead como convertido, apontando para ela;
--   3. registra o evento de etapa.
--
-- Em tres roundtrips, uma falha no meio deixa **um paciente orfao**: uma pessoa
-- no cadastro clinico que ninguem pediu, sem lead que a explique. Isso nao e
-- inconsistencia tecnica — e uma ficha de paciente a mais, num produto de
-- saude, que alguem vai encontrar depois sem saber de onde veio.
--
-- Aqui as tres acontecem na mesma transacao.
--
-- # `patients` JA EXISTE no schema remoto
--
-- E o detalhe que torna a atomicidade obrigatoria em vez de teorica:
-- `clinic_leads` nao existe ainda, mas `patients` existe. Uma implementacao em
-- duas etapas conseguiria criar o paciente e falhar no lead.
--
-- # O que a conversao NAO faz
--
-- Nao apaga o lead, nao copia observacoes internas e nao marca consentimento
-- LGPD. O lead permanece com o historico completo do funil; o consentimento e
-- ato do paciente e continua sendo registrado na ficha dele.

create or replace function public.convert_lead_to_patient(p_lead_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid := public.current_clinic_id();
  v_lead      public.clinic_leads;
  v_patient   uuid;
begin
  if v_clinic_id is null then
    raise exception 'no active clinic' using errcode = '42501';
  end if;

  -- Criar paciente e ato de `patient.write`, e nao de `team.read`: converter
  -- escreve no cadastro clinico, nao so no funil.
  if not public.has_clinic_role(
    array['owner', 'admin', 'professional', 'receptionist']::membership_role[]
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- `for update` trava a linha: dois cliques, ou duas abas, chegariam juntos e
  -- criariam DOIS pacientes para o mesmo lead. O estado e conferido depois.
  select * into v_lead
    from public.clinic_leads
   where id = p_lead_id
     and clinic_id = v_clinic_id
   for update;

  if not found then
    raise exception 'LEAD_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_lead.converted_patient_id is not null then
    raise exception 'ALREADY_CONVERTED' using errcode = '23505';
  end if;

  -- `biological_sex` e NOT NULL sem default util: 'not_informed' e o mesmo
  -- valor que o cadastro manual usa. O lead nao pergunta sexo biologico, e
  -- inventa-lo seria pior que declarar que nao foi informado.
  insert into public.patients (
    clinic_id, full_name, biological_sex, phone, email, address,
    is_active, created_by
  ) values (
    v_clinic_id, v_lead.name, 'not_informed', v_lead.phone, v_lead.email, '{}'::jsonb,
    true, auth.uid()
  )
  returning id into v_patient;

  update public.clinic_leads
     set stage = 'converted',
         converted_patient_id = v_patient,
         updated_at = now()
   where id = p_lead_id
     and clinic_id = v_clinic_id;

  insert into public.lead_events (clinic_id, lead_id, from_stage, to_stage, created_by)
  values (v_clinic_id, p_lead_id, v_lead.stage, 'converted', auth.uid());

  return v_patient;
end;
$$;

revoke all on function public.convert_lead_to_patient(uuid) from public;
grant execute on function public.convert_lead_to_patient(uuid) to authenticated;

commit;

-- Verificar depois de aplicar:
-- select relrowsecurity from pg_class where relname in ('clinic_leads','lead_events');
-- select policyname, tablename, cmd from pg_policies
--   where tablename in ('clinic_leads','lead_events');
-- Testar com duas clinicas: a clinica B nao deve ler nem inserir em A.
-- Depois: npm run db:types
