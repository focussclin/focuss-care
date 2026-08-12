-- =============================================================================
-- Portal do paciente: vinculo por convite, e leitura por funcao
-- =============================================================================
--
-- NAO APLICADA. Revisar no Supabase antes de executar.
--
-- ADITIVA: cria duas tabelas, oito funcoes e as policies DELAS. Nao altera
-- policy, coluna nem dado de nenhuma tabela existente. Ver "O que esta migration
-- deliberadamente NAO faz", mais abaixo — e a parte que importa.
--
-- =============================================================================
-- 1. O PROBLEMA
-- =============================================================================
--
-- O paciente nao e membro da clinica. Ele tem conta no Supabase Auth e
-- **nenhuma linha em `memberships`**, entao `current_clinic_id()` devolve null
-- para ele e toda policy do produto — que e da forma
-- `clinic_id = current_clinic_id()` — nega tudo. Isso e correto: o paciente nao
-- pode enxergar a clinica.
--
-- O que ele precisa e o oposto: enxergar UMA linha de paciente, e so o que
-- decorre dela.
--
-- =============================================================================
-- 2. POR QUE O VINCULO NAO PODE SER POR E-MAIL
-- =============================================================================
--
-- A tentacao e ligar `auth.users.email` a `patients.email` e pronto. Nao:
--
--  * `patients.email` e digitado pela recepcao, sem verificacao nenhuma. Um erro
--    de digitacao entrega o prontuario de alguem para um estranho.
--  * O mesmo e-mail aparece em varias clinicas e em varios pacientes (mae que
--    cadastra o proprio endereco nos filhos).
--  * Ninguem prova que controla aquele e-mail no momento do cadastro.
--
-- O vinculo aqui exige **duas coisas ao mesmo tempo**:
--
--   1. posse do token do convite (a clinica o entregou);
--   2. controle do e-mail do convite (provado pelo magic link do Supabase).
--
-- Uma sozinha nao basta. Quem interceptar o link nao consegue aceitar sem a
-- caixa de entrada; quem controla o e-mail nao consegue aceitar sem o token.
--
-- =============================================================================
-- 3. O QUE ESTA MIGRATION DELIBERADAMENTE NAO FAZ
-- =============================================================================
--
-- **Nao cria policy de SELECT em `patients`, `appointments` nem `invoices`.**
--
-- Seria o caminho obvio: `create policy ... using (patient_id in (...))`. E
-- estaria errado, porque RLS filtra LINHA e nao COLUNA. Com uma policy dessas, o
-- paciente alcanca o PostgREST direto — ele tem a chave publicavel e o proprio
-- JWT — e pede `select=*`:
--
--   * `patients.admin_notes`   — anotacao interna da recepcao sobre ele;
--   * `appointments.internal_notes` — idem;
--   * `invoices.notes`, `invoices.cancel_reason`.
--
-- Nenhuma dessas colunas e para o paciente. Por isso a leitura sai por FUNCAO
-- `security definer` com lista fechada de colunas: o que nao esta no `select` da
-- funcao nao existe para quem chama.
--
-- **Nao cria policy nenhuma em `medical_records`.** O prontuario nao entra no
-- portal, nem por funcao. Nao ha RPC que o alcance. Isso e decisao de produto e
-- de LGPD, e esta escrito aqui para que a proxima pessoa precise removar uma
-- linha explicita em vez de apenas esquecer de proibir.
-- =============================================================================

begin;

-- 1. Tipos ---------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'portal_invite_status') then
    create type public.portal_invite_status as enum (
      'pending',
      'accepted',
      'revoked'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'portal_account_status') then
    create type public.portal_account_status as enum ('active', 'revoked');
  end if;
end
$$;

-- Indice que as chaves compostas exigem. `if not exists` porque outras
-- migrations de 09/08 criam o mesmo.
create unique index if not exists patients_id_clinic_id_key
  on public.patients (id, clinic_id);

-- 2. Convites -------------------------------------------------------------------

create table if not exists public.patient_portal_invites (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,

  -- Guardado em minusculas e sem espacos. E o e-mail que o aceite vai EXIGIR.
  email text not null,

  -- Só o hash. O token em claro existe uma vez, no retorno da funcao que o cria,
  -- e nunca e gravado — mesmo desenho de `create_invitation` (07/08).
  token_hash text not null unique,

  status public.portal_invite_status not null default 'pending',
  expires_at timestamptz not null,

  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),

  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at timestamptz,

  -- FK COMPOSTA, com o tenant dentro: sem `clinic_id` na referencia o banco
  -- aceitaria um convite desta clinica apontando para o paciente de OUTRA.
  foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id) on delete cascade,

  -- Aceito precisa dizer quem e quando; pendente nao pode dizer.
  constraint patient_portal_invites_accepted_shape check (
    (status = 'accepted' and accepted_at is not null and accepted_by is not null)
    or (status <> 'accepted' and accepted_at is null and accepted_by is null)
  ),
  constraint patient_portal_invites_revoked_shape check (
    (status = 'revoked' and revoked_at is not null)
    or (status <> 'revoked' and revoked_at is null)
  )
);

-- UM convite pendente por paciente.
--
-- Sem isto, emitir de novo por engano deixaria dois tokens validos para a mesma
-- pessoa, e revogar um nao fecharia a porta do outro. O indice e PARCIAL porque
-- convites aceitos e revogados podem se acumular — eles sao o historico.
create unique index if not exists patient_portal_invites_one_pending_idx
  on public.patient_portal_invites (clinic_id, patient_id)
  where status = 'pending';

create index if not exists patient_portal_invites_patient_idx
  on public.patient_portal_invites (clinic_id, patient_id, created_at desc);

-- 3. Contas ---------------------------------------------------------------------

create table if not exists public.patient_portal_accounts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,

  status public.portal_account_status not null default 'active',
  linked_at timestamptz not null default now(),
  revoked_at timestamptz,

  -- De qual convite este vinculo nasceu. `set null` porque o vinculo sobrevive
  -- ao expurgo do convite, e a auditoria do "como entrou" nao pode derrubar o
  -- acesso de quem ja entrou.
  invite_id uuid references public.patient_portal_invites(id) on delete set null,

  foreign key (patient_id, clinic_id)
    references public.patients (id, clinic_id) on delete cascade,

  -- A mesma conta nao se vincula duas vezes ao mesmo paciente.
  unique (patient_id, user_id)
);

/*
 * UMA conta ativa por paciente — e o `where` e o que torna a regra reversivel.
 *
 * Revogar e trocar o titular (o filho que passa a cuidar da propria conta) tem
 * que ser possivel sem apagar historico. Com indice total, a linha revogada
 * bloquearia a nova.
 *
 * O caso "mae acompanha tres filhos" continua funcionando: e o mesmo `user_id`
 * em tres `patient_id` diferentes, que este indice nao restringe.
 */
create unique index if not exists patient_portal_accounts_one_active_idx
  on public.patient_portal_accounts (clinic_id, patient_id)
  where status = 'active';

create index if not exists patient_portal_accounts_user_idx
  on public.patient_portal_accounts (user_id)
  where status = 'active';

-- 4. RLS das duas tabelas novas --------------------------------------------------

alter table public.patient_portal_invites enable row level security;
alter table public.patient_portal_accounts enable row level security;

/*
 * Convite e assunto da EQUIPE, e de mais ninguem.
 *
 * O paciente nunca le esta tabela: o que ele precisa saber sobre o proprio
 * convite sai da funcao de pre-visualizacao, que devolve tres campos e nenhum
 * hash. Sem o predicado de papel, `clinic_id = current_clinic_id()` deixaria
 * qualquer membro ler `token_hash` de todos os convites pendentes — inutil para
 * forjar (e hash), e ainda assim informacao que ninguem precisa ter.
 *
 * A lista espelha `patient.write` em `src/lib/auth/permissions.ts`: quem pode
 * editar o cadastro do paciente pode dar acesso a ele. `finance` fica de fora.
 */
drop policy if exists "patient_portal_invites_select" on public.patient_portal_invites;
create policy "patient_portal_invites_select"
  on public.patient_portal_invites
  for select
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and public.has_clinic_role(variadic array['owner', 'admin', 'professional', 'receptionist']::membership_role[])
  );

/*
 * Sem policy de INSERT nem de UPDATE, de proposito.
 *
 * As duas escritas passam por funcao `security definer`, e so por ela:
 * `create_patient_portal_invite` gera o token e `accept_patient_portal_invite`
 * o consome. Deixar INSERT aberto permitiria a um membro gravar um convite com
 * `token_hash` escolhido por ele — ou seja, um token que ele conhece — para o
 * e-mail que quisesse. O aceite ainda exigiria o controle do e-mail, mas a
 * porta nao deve existir.
 *
 * Revogar tambem passa por funcao, pelo mesmo motivo.
 */

/*
 * O paciente le a PROPRIA conta, e a equipe le as da clinica.
 *
 * A primeira metade e o que permite a aplicacao saber, do lado do paciente, que
 * o vinculo existe — sem precisar de mais uma funcao so para isso.
 */
drop policy if exists "patient_portal_accounts_select" on public.patient_portal_accounts;
create policy "patient_portal_accounts_select"
  on public.patient_portal_accounts
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (
      clinic_id = public.current_clinic_id()
      and public.has_clinic_role(variadic array['owner', 'admin', 'professional', 'receptionist']::membership_role[])
    )
  );

-- 5. Quem sou eu, do lado do paciente ---------------------------------------------

/*
 * Os `patient_id` que a sessao atual pode ver.
 *
 * `security definer` e `stable`, e usada dentro das outras funcoes. Sai daqui, e
 * nao de um subselect repetido, porque uma regra de acesso escrita quatro vezes
 * e uma regra que vai divergir na quinta.
 */
create or replace function public.portal_patient_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select patient_id
    from public.patient_portal_accounts
   where user_id = auth.uid()
     and status = 'active'
$$;

revoke all on function public.portal_patient_ids() from public;
grant execute on function public.portal_patient_ids() to authenticated;

-- 6. Leitura do paciente — LISTA FECHADA DE COLUNAS --------------------------------

/*
 * Dados basicos. Note o que NAO esta no select: `admin_notes`, `cpf`, `cns`,
 * `address`, `emergency_contact`, `created_by`.
 *
 * `cpf` e `cns` ficam de fora por escolha: o paciente ja os conhece, e devolve-los
 * transforma o portal num lugar onde documento de identidade trafega sem
 * necessidade. Se um dia a tela precisar deles, a decisao e acrescentar a coluna
 * AQUI — visivel numa revisao — e nao afrouxar uma policy.
 */
create or replace function public.portal_my_profile()
returns table (
  patient_id uuid,
  clinic_id uuid,
  clinic_name text,
  full_name text,
  social_name text,
  birth_date date,
  email text,
  phone text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         p.clinic_id,
         c.trade_name,
         p.full_name,
         p.social_name,
         p.birth_date,
         p.email,
         p.phone
    from public.patients p
    join public.clinics c on c.id = p.clinic_id
   where p.id in (select public.portal_patient_ids())
$$;

revoke all on function public.portal_my_profile() from public;
grant execute on function public.portal_my_profile() to authenticated;

/*
 * Consultas. `internal_notes` NAO entra — e a anotacao que a equipe escreve
 * sobre o atendimento, e ela e da equipe.
 *
 * `reason` entra: e o motivo que a recepcao registrou ao marcar ("retorno",
 * "avaliacao"), e o paciente tem direito de saber para que foi chamado.
 */
create or replace function public.portal_my_appointments(
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  id uuid,
  patient_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.appointment_status,
  reason text,
  professional_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id,
         a.patient_id,
         a.starts_at,
         a.ends_at,
         a.status,
         a.reason,
         pr.display_name
    from public.appointments a
    left join public.professionals pr on pr.id = a.professional_id
   where a.patient_id in (select public.portal_patient_ids())
     and a.starts_at >= p_from
     and a.starts_at < p_to
   order by a.starts_at
$$;

revoke all on function public.portal_my_appointments(timestamptz, timestamptz) from public;
grant execute on function public.portal_my_appointments(timestamptz, timestamptz) to authenticated;

/*
 * Cobrancas. `notes` e `cancel_reason` ficam de fora pelo mesmo motivo de
 * `internal_notes`.
 *
 * Cobranca CANCELADA nao aparece: ela nao e devida, e mostra-la faria o
 * paciente perguntar sobre um valor que ninguem vai cobrar. O historico da
 * decisao continua no financeiro da clinica, onde ele pertence.
 */
create or replace function public.portal_my_invoices()
returns table (
  id uuid,
  patient_id uuid,
  status public.invoice_status,
  issue_date date,
  due_date date,
  total_cents integer,
  paid_cents integer
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id,
         i.patient_id,
         i.status,
         i.issue_date,
         i.due_date,
         i.total_cents,
         i.paid_cents
    from public.invoices i
   where i.patient_id in (select public.portal_patient_ids())
     and i.status <> 'canceled'
   order by coalesce(i.issue_date, i.due_date) desc nulls last
$$;

revoke all on function public.portal_my_invoices() from public;
grant execute on function public.portal_my_invoices() to authenticated;

-- 7. Emissao do convite -----------------------------------------------------------

/*
 * Gera o convite e devolve o token EM CLARO uma unica vez.
 *
 * O token nunca e gravado: so o sha256 dele. Quem perder o link precisa de um
 * convite novo, e isso e a garantia, nao o inconveniente — um token recuperavel
 * do banco seria um token que todo membro com leitura consegue usar.
 *
 * `p_email` e normalizado aqui, e nao na aplicacao: o aceite compara com
 * `auth.jwt() ->> 'email'`, e as duas pontas precisam da mesma normalizacao.
 */
create or replace function public.create_patient_portal_invite(
  p_patient_id uuid,
  p_email text,
  p_expires_in_days integer default 7
)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid := public.current_clinic_id();
  v_token     text;
  v_email     text := lower(trim(p_email));
  v_expires   timestamptz;
begin
  if v_clinic_id is null then
    raise exception 'no active clinic' using errcode = '42501';
  end if;

  -- Mesma lista de `patient.write`. Quem edita o cadastro pode dar acesso a ele.
  if not public.has_clinic_role(variadic array['owner', 'admin', 'professional', 'receptionist']::membership_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_EMAIL' using errcode = '22023';
  end if;

  if p_expires_in_days is null or p_expires_in_days < 1 or p_expires_in_days > 30 then
    raise exception 'INVALID_EXPIRY' using errcode = '22023';
  end if;

  -- O paciente precisa ser DESTA clinica. Sem isto, um id de outra clinica
  -- criaria convite valido para alguem que esta equipe nao atende.
  if not exists (
    select 1 from public.patients
     where id = p_patient_id
       and clinic_id = v_clinic_id
       and deleted_at is null
  ) then
    raise exception 'PATIENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.patient_portal_accounts
     where clinic_id = v_clinic_id
       and patient_id = p_patient_id
       and status = 'active'
  ) then
    raise exception 'ALREADY_LINKED' using errcode = '23505';
  end if;

  -- Emitir de novo SUBSTITUI o pendente. Dois tokens validos para a mesma pessoa
  -- fariam revogar um deixar o outro aberto.
  update public.patient_portal_invites
     set status = 'revoked', revoked_at = now()
   where clinic_id = v_clinic_id
     and patient_id = p_patient_id
     and status = 'pending';

  -- 32 bytes de aleatoriedade criptografica -> 64 hex.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := now() + make_interval(days => p_expires_in_days);

  insert into public.patient_portal_invites (
    clinic_id, patient_id, email, token_hash, expires_at, created_by
  ) values (
    v_clinic_id,
    p_patient_id,
    v_email,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_expires,
    auth.uid()
  );

  return query select v_token, v_expires;
end;
$$;

revoke all on function public.create_patient_portal_invite(uuid, text, integer) from public;
grant execute on function public.create_patient_portal_invite(uuid, text, integer) to authenticated;

-- 8. Revogacao --------------------------------------------------------------------

create or replace function public.revoke_patient_portal_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid := public.current_clinic_id();
begin
  if v_clinic_id is null or not public.has_clinic_role(variadic array['owner', 'admin', 'professional', 'receptionist']::membership_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.patient_portal_invites
     set status = 'revoked', revoked_at = now()
   where id = p_invite_id
     and clinic_id = v_clinic_id
     and status = 'pending';

  if not found then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.revoke_patient_portal_invite(uuid) from public;
grant execute on function public.revoke_patient_portal_invite(uuid) to authenticated;

-- 9. Pre-visualizacao do convite ---------------------------------------------------

/*
 * O que a tela do convite pode mostrar ANTES de haver sessao.
 *
 * Executavel por `anon`, e por isso o retorno e deliberadamente pobre: estado,
 * nome da clinica, primeiro nome do paciente e o e-mail MASCARADO. Nunca o
 * e-mail inteiro.
 *
 * Mascarar nao e teatro. Se o e-mail viesse em claro, o token — que viaja por
 * WhatsApp, e-mail, papel — passaria a revelar o endereco do paciente para
 * quem quer que o interceptasse. Mascarado, ele confirma para o dono ("e o meu
 * mesmo") sem entregar nada a quem nao sabia.
 *
 * A tela pede o e-mail DIGITADO. Aceitar exige o token E o controle daquele
 * e-mail; nenhum dos dois sozinho abre a porta.
 */
create or replace function public.preview_patient_portal_invite(p_token text)
returns table (
  status text,
  clinic_name text,
  patient_first_name text,
  masked_email text,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hash   text;
  v_invite public.patient_portal_invites;
  v_clinic text;
  v_first  text;
  v_local  text;
  v_domain text;
begin
  if p_token is null or length(p_token) <> 64 then
    return query select 'not-found'::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select * into v_invite
    from public.patient_portal_invites
   where token_hash = v_hash;

  if not found then
    return query select 'not-found'::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select c.trade_name into v_clinic
    from public.clinics c where c.id = v_invite.clinic_id;

  select split_part(p.full_name, ' ', 1) into v_first
    from public.patients p where p.id = v_invite.patient_id;

  v_local := split_part(v_invite.email, '@', 1);
  v_domain := split_part(v_invite.email, '@', 2);

  return query select
    case
      when v_invite.status = 'accepted' then 'accepted'
      when v_invite.status = 'revoked' then 'revoked'
      when v_invite.expires_at <= now() then 'expired'
      else 'valid'
    end::text,
    v_clinic,
    v_first,
    left(v_local, 1) || repeat('*', greatest(length(v_local) - 1, 1)) || '@' || v_domain,
    v_invite.expires_at;
end;
$$;

revoke all on function public.preview_patient_portal_invite(text) from public;
grant execute on function public.preview_patient_portal_invite(text) to anon, authenticated;

-- 10. Aceite -----------------------------------------------------------------------

/*
 * O momento do vinculo. Tudo o que importa acontece aqui.
 *
 * Exige, na mesma transacao:
 *   1. token que bate com um convite `pending`;
 *   2. convite dentro da validade;
 *   3. sessao autenticada;
 *   4. e-mail da sessao IGUAL ao do convite.
 *
 * A checagem 4 e o que impede o vinculo por coincidencia. Sem ela, quem
 * interceptasse o link entraria com a propria conta e viraria o paciente.
 *
 * `auth.jwt() ->> 'email'` e o e-mail que o Supabase Auth confirmou — ele so
 * existe no token depois do magic link, ou seja, depois de a pessoa ter aberto
 * a caixa de entrada daquele endereco.
 */
create or replace function public.accept_patient_portal_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash    text;
  v_invite  public.patient_portal_invites;
  v_user    uuid := auth.uid();
  v_email   text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_account uuid;
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if v_email = '' then
    raise exception 'NO_SESSION_EMAIL' using errcode = '42501';
  end if;

  if p_token is null or length(p_token) <> 64 then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  /*
   * `for update` trava a linha: dois cliques no botao, ou duas abas, chegariam
   * aqui juntos e criariam dois vinculos para o mesmo convite. O `status` e
   * conferido DEPOIS do lock, e nao antes.
   */
  select * into v_invite
    from public.patient_portal_invites
   where token_hash = v_hash
   for update;

  if not found then
    raise exception 'INVITE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_invite.status = 'accepted' then
    raise exception 'INVITE_USED' using errcode = '22023';
  end if;

  if v_invite.status = 'revoked' then
    raise exception 'INVITE_REVOKED' using errcode = '22023';
  end if;

  if v_invite.expires_at <= now() then
    raise exception 'INVITE_EXPIRED' using errcode = '22023';
  end if;

  -- A checagem que da nome a esta funcao.
  if lower(trim(v_invite.email)) <> v_email then
    raise exception 'EMAIL_MISMATCH' using errcode = '42501';
  end if;

  insert into public.patient_portal_accounts (
    clinic_id, patient_id, user_id, invite_id
  ) values (
    v_invite.clinic_id, v_invite.patient_id, v_user, v_invite.id
  )
  on conflict (patient_id, user_id) do update
     set status = 'active', revoked_at = null, linked_at = now()
  returning id into v_account;

  update public.patient_portal_invites
     set status = 'accepted', accepted_at = now(), accepted_by = v_user
   where id = v_invite.id;

  return v_account;
end;
$$;

revoke all on function public.accept_patient_portal_invite(text) from public;
grant execute on function public.accept_patient_portal_invite(text) to authenticated;

commit;

-- -----------------------------------------------------------------------------
-- Rodar ANTES de aplicar
-- -----------------------------------------------------------------------------
--
-- 1. O schema das funcoes de cripto varia entre projetos:
--      select n.nspname, p.proname from pg_proc p
--        join pg_namespace n on n.oid = p.pronamespace
--       where p.proname in ('digest', 'gen_random_bytes');
--    Se nao for `extensions`, ajuste as tres chamadas deste arquivo.
--
-- 2. Confirmar que `profiles.id` e a chave certa para `created_by`:
--      select column_name, data_type from information_schema.columns
--       where table_name = 'profiles' and column_name = 'id';
--
-- -----------------------------------------------------------------------------
-- Verificar DEPOIS de aplicar
-- -----------------------------------------------------------------------------
--
-- 1. Estrutura e RLS:
--      select relrowsecurity from pg_class
--       where relname in ('patient_portal_invites', 'patient_portal_accounts');
--      select policyname, tablename, cmd from pg_policies
--       where tablename like 'patient_portal_%';
--
-- 2. O PRONTUARIO continua inalcancavel. Com a sessao de um paciente vinculado:
--      select * from public.medical_records;          -- 0 linhas
--      select * from public.patients;                 -- 0 linhas
--      select * from public.appointments;             -- 0 linhas
--    As tres devem voltar VAZIAS: o portal le por funcao, nunca por tabela.
--    Se alguma voltar linha, existe policy que esta migration nao criou — e ela
--    expoe coluna interna.
--
-- 3. O aceite exige o e-mail. Com o token de um convite para a@x.com, logado
--    como b@y.com:
--      select public.accept_patient_portal_invite('<token>');
--      -> deve falhar com 42501 (EMAIL_MISMATCH)
--
-- 4. Nao reutiliza. Aceitar duas vezes o mesmo token:
--      -> a segunda deve falhar com 22023 (INVITE_USED)
--
-- 5. Expirado e revogado tambem recusam (22023).
--
-- -----------------------------------------------------------------------------
-- Depois de aplicar, no codigo
-- -----------------------------------------------------------------------------
--
-- 1. `npm run db:types`.
-- 2. Remover o shim `src/modules/patient-portal/infrastructure/portalDatabase.ts`.
-- =============================================================================
