-- =============================================================================
-- Focuss Care · Onda 1 (Fundação) · 0003 — Claims no JWT + helpers de RLS
-- =============================================================================
-- O CORAÇÃO DA PERFORMANCE MULTI-TENANT.
--
-- Erro clássico: policy do tipo
--     using (clinic_id in (select clinic_id from memberships where user_id = auth.uid()))
-- Isso executa uma subconsulta POR LINHA avaliada e ainda arrisca recursão de
-- RLS. Numa tabela de 10M agendamentos, é o que separa 8ms de 8s.
--
-- Solução: o Auth Hook injeta o vínculo no JWT no momento do login. As policies
-- leem um claim (custo O(1)). A tabela `memberships` continua sendo a fonte de
-- verdade; o JWT é cache com TTL = validade do token.
--
-- ATIVAÇÃO (passo manual, não dá para fazer por SQL):
--   Supabase Dashboard > Authentication > Hooks > Customize Access Token (JWT)
--   > Postgres  >  public.custom_access_token_hook
-- =============================================================================

-- -----------------------------------------------------------------------------
-- O hook
-- -----------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id    uuid  := (event ->> 'user_id')::uuid;
  v_claims     jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_preferred  uuid;
  v_active     uuid;
  v_role       public.membership_role;
  v_clinic_ids jsonb;
begin
  -- clínica que o usuário selecionou por último
  select p.active_clinic_id into v_preferred
  from public.profiles p
  where p.id = v_user_id;

  -- resolve a clínica ativa: a preferida, se ainda houver vínculo ativo;
  -- caso contrário o vínculo ativo mais antigo. NULL se não houver nenhum.
  select m.clinic_id, m.role
    into v_active, v_role
  from public.memberships m
  where m.user_id = v_user_id
    and m.status  = 'active'
  order by (m.clinic_id is not distinct from v_preferred) desc, m.created_at asc
  limit 1;

  -- todos os vínculos ativos (alimenta o seletor de clínica na UI)
  select coalesce(jsonb_agg(m.clinic_id order by m.created_at), '[]'::jsonb)
    into v_clinic_ids
  from public.memberships m
  where m.user_id = v_user_id
    and m.status  = 'active';

  v_claims := jsonb_set(v_claims, '{active_clinic_id}',
                        coalesce(to_jsonb(v_active), 'null'::jsonb), true);
  v_claims := jsonb_set(v_claims, '{clinic_role}',
                        coalesce(to_jsonb(v_role::text), 'null'::jsonb), true);
  v_claims := jsonb_set(v_claims, '{clinic_ids}', v_clinic_ids, true);

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'Injeta active_clinic_id, clinic_role e clinic_ids no JWT. Ativar em Auth > Hooks.';

-- Somente o serviço de Auth pode executar o hook.
grant  usage   on schema public to supabase_auth_admin;
grant  execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- O hook precisa ler estas tabelas (as policies correspondentes estão em 0004).
grant select on public.memberships to supabase_auth_admin;
grant select on public.profiles    to supabase_auth_admin;

-- -----------------------------------------------------------------------------
-- Helpers usados pelas policies
-- -----------------------------------------------------------------------------
-- Marcadas STABLE de propósito: assim o planner as trata como InitPlan e avalia
-- UMA VEZ por statement, e não por linha. Sempre invoque-as dentro de
-- `(select ...)` nas policies — é o que dispara essa otimização.
-- -----------------------------------------------------------------------------

create or replace function public.current_clinic_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'active_clinic_id', '')::uuid;
$$;

create or replace function public.current_clinic_role()
returns public.membership_role
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'clinic_role', '')::public.membership_role;
$$;

create or replace function public.has_clinic_role(variadic p_roles public.membership_role[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.current_clinic_role() = any (p_roles);
$$;

-- Acesso a CONTEÚDO CLÍNICO (prontuário, evolução, anexos).
-- Decisão do cliente (Onda 1): todos os profissionais da clínica leem tudo.
-- Recepção e financeiro NUNCA leem conteúdo clínico — isso não é negociável,
-- é a fronteira mínima defensável em auditoria.
-- Para restringir depois ao autor + atendimento ativo, altere APENAS esta
-- função: nenhuma tabela muda.
create or replace function public.can_access_clinical()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.current_clinic_role() in ('owner', 'admin', 'professional');
$$;

comment on function public.can_access_clinical() is
  'Ponto único de decisão sobre leitura de dado clínico. Endurecer a regra = editar esta função.';

-- Verificação AUTORITATIVA (vai na tabela, ignora o JWT).
-- Usar em operações sensíveis e irreversíveis, onde um JWT desatualizado
-- (até ~30 min após revogação de acesso) seria inaceitável.
create or replace function public.is_active_member(p_clinic uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.clinic_id = p_clinic
      and m.user_id   = auth.uid()
      and m.status    = 'active'
  );
$$;

-- Duas pessoas compartilham alguma clínica? (usado para leitura de colegas)
create or replace function private.shares_clinic_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships a
    join public.memberships b on b.clinic_id = a.clinic_id
    where a.user_id = auth.uid() and a.status = 'active'
      and b.user_id = p_user     and b.status = 'active'
  );
$$;
