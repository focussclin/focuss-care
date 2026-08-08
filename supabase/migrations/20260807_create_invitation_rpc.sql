-- =============================================================================
-- create_invitation: emitir convite e devolver o token CRU uma unica vez
-- =============================================================================
--
-- APLICADA no projeto Supabase em 08/08/2026. O aceite funcional com duas
-- contas ainda deve ser verificado no ambiente remoto.
--
-- Problema: `invitations` guarda `token_hash` e o schema so expoe
-- `accept_invitation(p_token)`. Nao ha RPC de criacao, entao a aplicacao teria
-- que inserir o hash — o que exige conhecer o algoritmo de comparacao.
--
-- Por que a aplicacao NAO pode conhece-lo: quem sabe gerar `token_hash` valido
-- sabe forjar convite, e o convite deixa de ser prova de que alguem foi
-- convidado. O token precisa nascer onde o hash e calculado, e sair daqui uma
-- unica vez — nunca mais sendo recuperavel.
--
-- -----------------------------------------------------------------------------
-- ATENCAO DO REVISOR — o unico ponto que nao pude verificar
-- -----------------------------------------------------------------------------
-- O `digest(..., 'sha256')` abaixo PRECISA ser o mesmo algoritmo que
-- `accept_invitation` usa para comparar. Nao consegui ler o corpo dela a partir
-- do repositorio (bloqueio B1: sem acesso SQL). Se ela usar `crypt()`, ou outra
-- codificacao, TODO convite emitido por esta funcao sera recusado no aceite — e
-- o defeito so aparece quando uma pessoa real tentar entrar.
--
-- Antes de aplicar, rodar:
--
--   select prosrc from pg_proc where proname = 'accept_invitation';
--
-- e alinhar as duas. Se `accept_invitation` usar `crypt()`, trocar a linha do
-- hash por `crypt(v_token, gen_salt('bf'))`.
-- =============================================================================

begin;

create or replace function public.create_invitation(
  p_email text,
  p_role public.membership_role,
  p_expires_in interval default interval '7 days'
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_clinic_id uuid := public.current_clinic_id();
  v_token     text;
begin
  -- Quem convida precisa administrar a clinica. `owner` e `admin` batem com a
  -- permissao `team.manage` da matriz em src/lib/auth/permissions.ts.
  if not public.has_clinic_role(array['owner', 'admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_clinic_id is null then
    raise exception 'no active clinic' using errcode = '42501';
  end if;

  -- 32 bytes de aleatoriedade criptografica -> 64 hex. Nao e uuid: uuid v4 tem
  -- 122 bits e formato reconhecivel, e um token de convite nao deve parecer um
  -- identificador que se possa tentar adivinhar a partir de outro.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.invitations (clinic_id, email, role, token_hash, expires_at, created_by)
  values (
    v_clinic_id,
    lower(btrim(p_email)),
    p_role,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),  -- <-- ALINHAR (ver cabecalho)
    now() + p_expires_in,
    auth.uid()
  );

  -- O token cru sai daqui UMA vez. Nao ha como recupera-lo depois: a tabela so
  -- guarda o hash. Convite perdido se resolve emitindo outro, nunca lendo o
  -- antigo — e e isso que impede um administrador de descobrir tokens alheios.
  return v_token;
end;
$$;

revoke all on function public.create_invitation(text, public.membership_role, interval) from public;
grant execute on function public.create_invitation(text, public.membership_role, interval) to authenticated;

commit;

-- Verificar depois de aplicar:
--   1. emitir convite pela aplicacao (tela de Equipe, S-01)
--   2. aceitar com OUTRA conta
--   3. confirmar vinculo em `memberships` com status = 'active'
--   4. confirmar que o mesmo token nao pode ser aceito duas vezes
