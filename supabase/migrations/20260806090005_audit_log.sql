-- =============================================================================
-- Focuss Care · Onda 1 (Fundação) · 0005 — Trilha de auditoria
-- =============================================================================
-- Exigência do CFM (Res. 1.821/2007 / padrão SBIS-CFM) e da LGPD: é preciso
-- saber quem fez o quê, quando. Como a clínica optou por prontuário legível
-- por todos os profissionais, a trilha de auditoria deixa de ser "boa prática"
-- e passa a ser o principal controle compensatório.
--
-- Particionada por mês desde o dia 1: audit_log é a tabela que mais cresce em
-- qualquer SaaS de saúde, e particionar depois de 200M linhas é cirurgia.
-- =============================================================================

create table if not exists public.audit_log (
  id             bigint generated always as identity,
  clinic_id      uuid,
  actor_user_id  uuid,
  actor_role     public.membership_role,
  action         text not null,            -- INSERT | UPDATE | DELETE | READ | EXPORT | LOGIN
  entity_type    text not null,            -- nome da tabela ou recurso lógico
  entity_id      uuid,
  before         jsonb,
  after          jsonb,
  ip             inet,
  user_agent     text,
  occurred_at    timestamptz not null default now(),

  primary key (id, occurred_at)
) partition by range (occurred_at);

create index if not exists audit_log_clinic_time_idx
  on public.audit_log (clinic_id, occurred_at desc);
create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id, occurred_at desc);
create index if not exists audit_log_actor_idx
  on public.audit_log (actor_user_id, occurred_at desc);

comment on table public.audit_log is
  'Append-only. Nunca sofre UPDATE ou DELETE — retenção é feita descartando partições inteiras.';
comment on column public.audit_log.action is
  'READ e EXPORT são gravados pela camada de aplicação: não existe gatilho de SELECT no Postgres.';

-- -----------------------------------------------------------------------------
-- Partições mensais
-- -----------------------------------------------------------------------------
create or replace function private.ensure_audit_partition(p_month date)
returns void
language plpgsql
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name  text := format('audit_log_%s', to_char(v_start, 'YYYY_MM'));
begin
  if to_regclass('public.' || v_name) is null then
    execute format(
      'create table public.%I partition of public.audit_log for values from (%L) to (%L)',
      v_name, v_start, v_end
    );
  end if;
end;
$$;

-- Cria do mês corrente até 12 meses à frente.
do $$
declare i int;
begin
  for i in -1 .. 12 loop
    perform private.ensure_audit_partition((date_trunc('month', now()) + (i || ' month')::interval)::date);
  end loop;
end $$;

-- Agende mensalmente (Supabase Dashboard > Integrations > Cron), ou via pg_cron:
--   select cron.schedule('audit-partitions', '0 3 1 * *',
--     $$select private.ensure_audit_partition((now() + interval '13 months')::date)$$);

-- -----------------------------------------------------------------------------
-- Gatilho genérico de auditoria
-- -----------------------------------------------------------------------------
create or replace function private.tg_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    jsonb;
  v_clinic uuid;
begin
  v_row    := case tg_op when 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_clinic := nullif(v_row ->> 'clinic_id', '')::uuid;

  insert into public.audit_log (
    clinic_id, actor_user_id, actor_role, action, entity_type, entity_id, before, after
  ) values (
    v_clinic,
    auth.uid(),
    public.current_clinic_role(),
    tg_op,
    tg_table_name,
    nullif(v_row ->> 'id', '')::uuid,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

-- Açúcar para plugar auditoria numa tabela
create or replace function private.attach_audit(p_table regclass)
returns void
language plpgsql
as $$
begin
  execute format('drop trigger if exists audit_trg on %s', p_table);
  execute format(
    'create trigger audit_trg after insert or update or delete on %s
       for each row execute function private.tg_audit()', p_table
  );
end;
$$;

select private.attach_audit('public.clinics');
select private.attach_audit('public.memberships');
select private.attach_audit('public.professionals');
select private.attach_audit('public.invitations');

-- -----------------------------------------------------------------------------
-- RLS do audit_log
-- -----------------------------------------------------------------------------
-- ENABLE mas deliberadamente SEM FORCE: o gatilho roda como SECURITY DEFINER
-- (dono = postgres) e precisa inserir. Com FORCE, o próprio dono cairia nas
-- policies e a auditoria falharia silenciosamente.
alter table public.audit_log enable row level security;

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    clinic_id = (select public.current_clinic_id())
    and (select public.has_clinic_role('owner','admin'))
  );

-- Sem policies de INSERT/UPDATE/DELETE para `authenticated`: a trilha só é
-- escrita por gatilho ou pelo servidor. Cliente não adultera auditoria.
