-- =============================================================================
-- Focuss Care · Onda 1 (Fundação) · 0004 — Row Level Security do núcleo
-- =============================================================================
-- Padrão obrigatório para TODA tabela de negócio:
--   1. enable  row level security  → aplica a usuários comuns
--   2. force   row level security  → aplica TAMBÉM ao dono da tabela (postgres).
--      Roles com atributo BYPASSRLS (service_role) continuam passando — é assim
--      que o servidor executa operações administrativas.
--   3. políticas separadas por comando, sempre com `(select fn())` para que o
--      planner avalie uma vez por statement e não por linha.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- clinics
-- -----------------------------------------------------------------------------
alter table public.clinics enable  row level security;
alter table public.clinics force   row level security;

-- Vê a clínica ativa e as demais em que tem vínculo (para o seletor de clínica).
create policy clinics_select on public.clinics
  for select to authenticated
  using (
    id = (select public.current_clinic_id())
    or id::text in (
      select jsonb_array_elements_text(coalesce(auth.jwt() -> 'clinic_ids', '[]'::jsonb))
    )
  );

create policy clinics_update on public.clinics
  for update to authenticated
  using      (id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')))
  with check (id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')));

-- INSERT e DELETE de clínica não são expostos ao cliente.
-- Criação acontece por RPC transacional (0006); exclusão é operação de
-- plataforma, sujeita a retenção legal de prontuário.

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.profiles force  row level security;

create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- Colegas da mesma clínica: necessário para exibir "atendido por Dr. X".
-- ATENÇÃO: esta policy libera a LINHA inteira. Nunca adicione CPF, endereço
-- ou documento pessoal a `profiles` — se precisar, crie tabela separada com
-- policy própria. É por aqui que SaaS de saúde costuma vazar PII de equipe.
create policy profiles_select_colleagues on public.profiles
  for select to authenticated
  using (private.shares_clinic_with(id));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using      (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- O Auth Hook roda como supabase_auth_admin e precisa ler estas tabelas.
create policy profiles_auth_admin_read on public.profiles
  as permissive for select to supabase_auth_admin using (true);

-- -----------------------------------------------------------------------------
-- memberships
-- -----------------------------------------------------------------------------
alter table public.memberships enable row level security;
alter table public.memberships force  row level security;

create policy memberships_auth_admin_read on public.memberships
  as permissive for select to supabase_auth_admin using (true);

-- Todo membro enxerga a equipe da clínica ativa.
create policy memberships_select on public.memberships
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()));

-- Ver os próprios vínculos, mesmo os de outras clínicas (seletor de clínica).
create policy memberships_select_own on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (
    clinic_id = (select public.current_clinic_id())
    and (select public.has_clinic_role('owner','admin'))
  );

create policy memberships_update on public.memberships
  for update to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')))
  with check (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')));

-- Sem DELETE: desligamento é `status = 'revoked'`. Apagar vínculo destrói a
-- trilha de "quem tinha acesso quando", que é justamente o que a auditoria pede.

-- -----------------------------------------------------------------------------
-- invitations
-- -----------------------------------------------------------------------------
alter table public.invitations enable row level security;
alter table public.invitations force  row level security;

create policy invitations_select on public.invitations
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')));

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')));

create policy invitations_update on public.invitations
  for update to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')))
  with check (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')));

-- Aceitar convite acontece por RPC (o usuário ainda não é membro, logo não
-- passaria por nenhuma policy acima).

-- -----------------------------------------------------------------------------
-- professionals
-- -----------------------------------------------------------------------------
alter table public.professionals enable row level security;
alter table public.professionals force  row level security;

create policy professionals_select on public.professionals
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()));

create policy professionals_insert on public.professionals
  for insert to authenticated
  with check (
    clinic_id = (select public.current_clinic_id())
    and (select public.has_clinic_role('owner','admin'))
  );

create policy professionals_update on public.professionals
  for update to authenticated
  using (
    clinic_id = (select public.current_clinic_id())
    and (
      (select public.has_clinic_role('owner','admin'))
      or user_id = (select auth.uid())        -- o profissional edita o próprio perfil
    )
  )
  with check (clinic_id = (select public.current_clinic_id()));

-- Sem DELETE: inativação é `is_active = false` / `deleted_at`. Profissional
-- apagado deixaria atendimentos e prontuários órfãos de autoria.
