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
-- `has_clinic_role(array['owner','admin'])` antes de inserir `p_role`
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
  if not public.has_clinic_role(array['owner', 'admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- NOVO: e ninguem concede o papel que nao tem. Ver o cabecalho.
  if p_role = 'owner' and not public.has_clinic_role(array['owner']) then
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
