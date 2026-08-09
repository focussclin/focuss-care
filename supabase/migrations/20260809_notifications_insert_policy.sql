-- =============================================================================
-- Notificações operacionais criadas pelo próprio usuário autenticado
-- =============================================================================
--
-- NAO APLICADA. Revisar no Supabase antes de executar.
--
-- A tabela `notifications` JA EXISTE no schema remoto — esta migration não cria
-- nada, só acrescenta a policy de INSERT.
--
-- O centro de notificações é recortado por `user_id` no repositório. Esta policy
-- fecha também a ESCRITA: sem ela, uma action poderia fabricar um aviso para
-- outro usuário, ou para outra clínica. O recorte de leitura não impede isso —
-- ele só decide quem vê depois de a linha existir.
--
-- `auth.uid()` e não `current_clinic_id()` sozinho: as duas condições respondem
-- perguntas diferentes, e só as duas juntas fecham o caso de alguém escrever na
-- clínica certa para a pessoa errada.
-- =============================================================================

begin;

alter table public.notifications enable row level security;

drop policy if exists "notifications_insert_own_user" on public.notifications;
create policy "notifications_insert_own_user"
  on public.notifications
  for insert
  to authenticated
  with check (
    clinic_id = public.current_clinic_id()
    and user_id = auth.uid()
  );

commit;

-- -----------------------------------------------------------------------------
-- Verificar DEPOIS de aplicar
-- -----------------------------------------------------------------------------
--
-- 1. A policy existe e cobre INSERT:
--      select policyname, cmd from pg_policies
--       where tablename = 'notifications';
--
-- 2. Com duas contas: logado na clínica A, tentar inserir uma notificação com
--    `user_id` de outra pessoa -> deve ser recusado (42501).
-- =============================================================================
