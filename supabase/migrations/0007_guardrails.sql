-- =============================================================================
-- Focuss Care · Onda 1 (Fundação) · 0007 — Guarda-corpos anti-vazamento
-- =============================================================================
-- A falha mais cara num SaaS multi-tenant não é um bug de tela: é uma tabela
-- nova que sobe sem RLS. Ninguém percebe até o cliente A ver o dado do B.
-- Estes objetos existem para que o CI reprove esse commit.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Inventário de cobertura de RLS (em `private`: não vira endpoint HTTP)
-- -----------------------------------------------------------------------------
create or replace view private.v_rls_coverage as
select
  c.relname::text                         as table_name,
  c.relrowsecurity                        as rls_enabled,
  c.relforcerowsecurity                   as rls_forced,
  (select count(*) from pg_policy p where p.polrelid = c.oid) as policy_count,
  exists (
    select 1 from pg_attribute a
    where a.attrelid = c.oid and a.attname = 'clinic_id' and a.attnum > 0 and not a.attisdropped
  )                                       as has_clinic_id
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')          -- tabelas e tabelas particionadas
  and c.relispartition is false;       -- partições herdam a RLS do pai

comment on view private.v_rls_coverage is
  'Uma linha por tabela de negócio. rls_enabled = false é incidente de segurança.';

-- -----------------------------------------------------------------------------
-- Asserção: falha se alguma tabela ficou sem RLS ou sem política.
-- Rodar no CI após aplicar migrations.
-- -----------------------------------------------------------------------------
create or replace function private.assert_rls_coverage()
returns void
language plpgsql
as $$
declare
  v_offenders text;
begin
  select string_agg(
           format('%s (rls=%s, policies=%s)', table_name, rls_enabled, policy_count),
           ', ' order by table_name)
    into v_offenders
  from private.v_rls_coverage
  where table_name not in ('plans')          -- catálogo público, sem clinic_id
    and (not rls_enabled or policy_count = 0);

  if v_offenders is not null then
    raise exception 'Tabelas sem RLS ou sem política: %', v_offenders;
  end if;
end;
$$;

-- Deve passar silenciosamente:
select private.assert_rls_coverage();

-- -----------------------------------------------------------------------------
-- Teste de isolamento entre tenants.
-- Simula dois usuários de clínicas diferentes e confirma que nenhum enxerga
-- a linha do outro. Este teste PRECISA rodar em todo PR — é a única prova
-- automatizada de que o isolamento continua funcionando.
-- -----------------------------------------------------------------------------
create or replace function private.test_tenant_isolation()
returns table (scenario text, passed boolean, detail text)
language plpgsql
as $$
declare
  v_clinic_a uuid;
  v_clinic_b uuid;
  v_visible  int;
begin
  -- Contexto: clínica A ativa no "JWT" simulado
  select id into v_clinic_a from public.clinics order by created_at limit 1;
  select id into v_clinic_b from public.clinics where id <> v_clinic_a order by created_at limit 1;

  if v_clinic_a is null or v_clinic_b is null then
    return query select 'pré-requisito'::text, false,
                        'Precisa de ao menos duas clínicas de teste no banco'::text;
    return;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated',
                      'active_clinic_id', v_clinic_a)::text,
    true
  );
  set local role authenticated;

  select count(*) into v_visible from public.professionals where clinic_id = v_clinic_b;
  return query select 'professionals de outra clínica'::text, v_visible = 0,
                      format('linhas visíveis: %s (esperado 0)', v_visible);

  select count(*) into v_visible from public.memberships where clinic_id = v_clinic_b;
  return query select 'memberships de outra clínica'::text, v_visible = 0,
                      format('linhas visíveis: %s (esperado 0)', v_visible);

  select count(*) into v_visible from public.clinic_settings where clinic_id = v_clinic_b;
  return query select 'clinic_settings de outra clínica'::text, v_visible = 0,
                      format('linhas visíveis: %s (esperado 0)', v_visible);

  reset role;
end;
$$;

comment on function private.test_tenant_isolation() is
  'Executar com duas clínicas semeadas. Qualquer passed=false bloqueia o deploy.';
