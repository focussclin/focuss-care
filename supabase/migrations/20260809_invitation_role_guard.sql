-- =============================================================================
-- create_invitation: ninguém convida para um papel que não tem
-- =============================================================================
--
-- NAO APLICADA. Revisar no Supabase antes de executar.
--
-- Substitui a função criada por `20260807_create_invitation_rpc.sql`, que JÁ
-- ESTÁ APLICADA — por isso esta migration é um `create or replace`, e não um
-- `create`.
--
-- # A escalada que ela fecha
--
-- `src/lib/auth/permissions.ts` exclui `admin` de CLINICAL como controle de
-- LGPD, com a razão escrita: "administrar a clínica não é cuidar do paciente".
-- Mas `admin` tem `team.manage`, e a função original checava só
-- `has_clinic_role(variadic array['owner','admin']::membership_role[])` antes de inserir `p_role`
-- literalmente.
--
-- Consequência: um `admin` emitia um convite de `owner` para um endereço que
-- controla, aceitava em outra sessão e passava a ler o prontuário de todos os
-- pacientes. O controle era contornável exatamente por quem ele restringia.
--
-- A mesma escalada tinha uma segunda porta em `changeRole`, fechada no código
-- da aplicação. Esta migration fecha a do banco.
--
-- # Por que também no banco, se a aplicação já barra
--
-- Porque a função é `security definer`: ela roda com os privilégios de quem a
-- criou, e qualquer chamador autenticado alcança a RPC diretamente pelo
-- PostgREST, sem passar pela Server Action. A barreira da aplicação cobre o
-- produto; esta cobre a superfície.
--
-- -----------------------------------------------------------------------------
-- DECISOES QUE O REVISOR PRECISA CONFERIR
-- -----------------------------------------------------------------------------
--
-- 1. Só `owner` concede `owner`. `admin` continua convidando todos os demais
--    papéis — a mudança não reduz o que ele já fazia legitimamente.
--
-- 2. O corpo abaixo precisa reproduzir o RESTANTE da função original sem
--    alteração. Antes de aplicar, compare com o que está no banco:
--
--      select prosrc from pg_proc where proname = 'create_invitation';
--
--    Se divergir do arquivo de 07/08 (por edição manual no painel, por
--    exemplo), **pare** e reconcilie: um `create or replace` cego apagaria a
--    diferença sem avisar.
-- =============================================================================

begin;

-- =============================================================================
-- A versão de 07/08 precisa SAIR, não ser substituída.
--
-- `create or replace` só substitui quando a assinatura é idêntica. A função de
-- 07/08 recebe um terceiro parâmetro (`p_expires_in interval default 7 days`),
-- então o `create` abaixo não a substituiu: criou uma SOBRECARGA ao lado dela.
--
-- Com as duas no banco, a chamada da aplicação — que passa `p_email` e `p_role`
-- — casa igualmente bem com as duas, e o Postgres recusa antes de executar:
--
--   ERROR 42725: function public.create_invitation(...) is not unique
--   HINT: Could not choose a best candidate function.
--
-- Ou seja: convidar alguém para a equipe falhava por completo. O defeito passou
-- despercebido porque nenhuma das duas migrations chegou a ser aplicada até
-- 12/08/2026 — o erro exige as duas versões vivas no mesmo banco.
--
-- A que fica é esta, de dois parâmetros: é a que a aplicação chama e a única com
-- o guard contra escalonamento de papel. A expiração de sete dias, que era
-- parâmetro, virou constante no corpo — nenhum caminho do produto a variava.
-- =============================================================================
drop function if exists public.create_invitation(
  text,
  public.membership_role,
  interval
);

create or replace function public.create_invitation(
  p_email text,
  p_role public.membership_role
)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid := public.current_clinic_id();
  v_token     text;
begin
  -- Quem convida precisa administrar a clinica.
  if not public.has_clinic_role(variadic array['owner', 'admin']::membership_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- NOVO: e ninguem concede o papel que nao tem. Ver o cabecalho.
  if p_role = 'owner' and not public.has_clinic_role(variadic array['owner']::membership_role[]) then
    raise exception 'role escalation' using errcode = '42501';
  end if;

  if v_clinic_id is null then
    raise exception 'no active clinic' using errcode = '42501';
  end if;

  -- 32 bytes de aleatoriedade criptografica -> 64 hex.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.invitations (
    clinic_id, email, role, token_hash, expires_at, invited_by
  ) values (
    v_clinic_id,
    lower(trim(p_email)),
    p_role,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    now() + interval '7 days',
    auth.uid()
  );

  return query select v_token, (now() + interval '7 days')::timestamptz;
end;
$$;

-- =============================================================================
-- Quem pode EXECUTAR — o `create` não herda isto da função anterior.
--
-- Função nova nasce com `execute` para `public`, e `anon` faz parte de `public`:
-- sem o revoke, uma sessão não autenticada alcança uma função `security definer`.
-- Aqui ela pararia em `current_clinic_id() is null`, mas depender do corpo para
-- barrar quem nem devia chegar até ele inverte a ordem das defesas.
--
-- A migration de 07/08 fazia isto para a assinatura de três parâmetros; ao
-- recriar com outra assinatura, a concessão ficou para trás.
-- =============================================================================
revoke all on function public.create_invitation(text, public.membership_role)
  from public;

/*
 * `anon` precisa ser revogado À PARTE — e isto não é redundância.
 *
 * O Supabase mantém `alter default privileges` no schema `public` para `anon`,
 * `authenticated` e `service_role`. Toda função nova nasce com `execute`
 * concedido DIRETAMENTE a esses papéis, e um grant direto não é alcançado por
 * `revoke ... from public`. Verificável no catálogo:
 *
 *   select proacl from pg_proc where proname = 'create_invitation';
 *   -- anon=X/postgres  <- grant direto, sobrevive ao revoke de public
 */
revoke all on function public.create_invitation(text, public.membership_role)
  from anon;

grant execute on function public.create_invitation(text, public.membership_role)
  to authenticated;

commit;

-- -----------------------------------------------------------------------------
-- Rodar ANTES de aplicar — OBRIGATORIO
-- -----------------------------------------------------------------------------
--
-- O corpo acima foi reconstruido a partir de
-- `20260807_create_invitation_rpc.sql`. Confirme que o que esta no banco bate,
-- e ajuste este arquivo se nao bater:
--
--   select prosrc from pg_proc where proname = 'create_invitation';
--
-- Confirme tambem o nome do schema das funcoes de cripto (`extensions.digest`
-- e `extensions.gen_random_bytes`), que varia entre projetos:
--
--   select n.nspname, p.proname from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where p.proname in ('digest', 'gen_random_bytes');
--
-- -----------------------------------------------------------------------------
-- Verificar DEPOIS de aplicar
-- -----------------------------------------------------------------------------
--
-- Com uma conta `admin`:
--   select * from public.create_invitation('teste@exemplo.com', 'owner');
--     -> deve falhar com 42501
--   select * from public.create_invitation('teste@exemplo.com', 'receptionist');
--     -> deve funcionar
--
-- Com uma conta `owner`:
--   select * from public.create_invitation('teste@exemplo.com', 'owner');
--     -> deve funcionar
-- =============================================================================
