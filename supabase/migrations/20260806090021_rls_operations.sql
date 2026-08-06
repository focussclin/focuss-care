-- =============================================================================
-- Focuss Care · Onda 4 (Operação e IA) · 0021 — RLS de operação e IA
-- =============================================================================

-- =============================================================================
-- RH — dado trabalhista é sensível; nem o financeiro comum vê salário
-- =============================================================================
alter table public.employees enable row level security;
alter table public.employees force  row level security;

create policy employees_select on public.employees
  for select to authenticated
  using (
    clinic_id = (select public.current_clinic_id())
    and (
      (select public.has_clinic_role('owner','admin'))
      or user_id = (select auth.uid())        -- cada um vê o próprio cadastro
    )
  );

create policy employees_write on public.employees
  for all to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')))
  with check (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')));

alter table public.work_schedules enable row level security;
alter table public.work_schedules force  row level security;

create policy work_schedules_select on public.work_schedules
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()));

create policy work_schedules_write on public.work_schedules
  for all to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')))
  with check (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')));

alter table public.time_off enable row level security;
alter table public.time_off force  row level security;

create policy time_off_select on public.time_off
  for select to authenticated
  using (
    clinic_id = (select public.current_clinic_id())
    and (
      (select public.has_clinic_role('owner','admin'))
      or exists (
        select 1 from public.employees e
        where e.id = time_off.employee_id and e.user_id = (select auth.uid())
      )
    )
  );

create policy time_off_insert on public.time_off
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id()));

create policy time_off_update on public.time_off
  for update to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')))
  with check (clinic_id = (select public.current_clinic_id()));

-- =============================================================================
-- COMUNICAÇÃO — atendimento é operacional, toda a equipe participa
-- =============================================================================
alter table public.whatsapp_channels enable row level security;
alter table public.whatsapp_channels force  row level security;

create policy whatsapp_channels_select on public.whatsapp_channels
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()));

create policy whatsapp_channels_write on public.whatsapp_channels
  for all to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')))
  with check (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')));

alter table public.conversations enable row level security;
alter table public.conversations force  row level security;

create policy conversations_select on public.conversations
  for select to authenticated using (clinic_id = (select public.current_clinic_id()));

create policy conversations_write on public.conversations
  for all to authenticated
  using      (clinic_id = (select public.current_clinic_id()))
  with check (clinic_id = (select public.current_clinic_id()));

alter table public.messages enable row level security;
alter table public.messages force  row level security;

create policy messages_select on public.messages
  for select to authenticated using (clinic_id = (select public.current_clinic_id()));

create policy messages_insert on public.messages
  for insert to authenticated with check (clinic_id = (select public.current_clinic_id()));

create policy messages_update on public.messages
  for update to authenticated
  using      (clinic_id = (select public.current_clinic_id()))
  with check (clinic_id = (select public.current_clinic_id()));

-- Sem DELETE: histórico de conversa com paciente é registro de atendimento.

alter table public.message_templates enable row level security;
alter table public.message_templates force  row level security;

create policy message_templates_select on public.message_templates
  for select to authenticated using (clinic_id = (select public.current_clinic_id()));

create policy message_templates_write on public.message_templates
  for all to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')))
  with check (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')));

-- notifications — cada um vê só as suas
alter table public.notifications enable row level security;
alter table public.notifications force  row level security;

create policy notifications_select on public.notifications
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()) and user_id = (select auth.uid()));

create policy notifications_update on public.notifications
  for update to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and user_id = (select auth.uid()))
  with check (clinic_id = (select public.current_clinic_id()) and user_id = (select auth.uid()));

-- =============================================================================
-- AUTOMAÇÕES
-- =============================================================================
alter table public.workflows enable row level security;
alter table public.workflows force  row level security;

create policy workflows_select on public.workflows
  for select to authenticated using (clinic_id = (select public.current_clinic_id()));

create policy workflows_write on public.workflows
  for all to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')))
  with check (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')));

alter table public.workflow_runs enable row level security;
alter table public.workflow_runs force  row level security;

create policy workflow_runs_select on public.workflow_runs
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')));

-- Escrita só pelo worker (chave de serviço). Cliente não fabrica execução.

-- =============================================================================
-- IA
-- =============================================================================
-- ★ document_embeddings: trecho vindo de prontuário exige acesso clínico.
--   Sem esta cláusula, a recepção faria uma pergunta ao assistente e receberia
--   de volta um pedaço de evolução médica — pela porta dos fundos do RAG.
alter table public.document_embeddings enable row level security;
alter table public.document_embeddings force  row level security;

create policy document_embeddings_select on public.document_embeddings
  for select to authenticated
  using (
    clinic_id = (select public.current_clinic_id())
    and (
      source_type <> 'medical_record'
      or (select public.can_access_clinical())
    )
  );

-- Indexação é feita pelo servidor (chave de serviço), nunca pelo cliente.

alter table public.ai_conversations enable row level security;
alter table public.ai_conversations force  row level security;

create policy ai_conversations_select on public.ai_conversations
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()) and user_id = (select auth.uid()));

create policy ai_conversations_write on public.ai_conversations
  for all to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and user_id = (select auth.uid()))
  with check (clinic_id = (select public.current_clinic_id()) and user_id = (select auth.uid()));

alter table public.ai_messages enable row level security;
alter table public.ai_messages force  row level security;

create policy ai_messages_select on public.ai_messages
  for select to authenticated
  using (
    clinic_id = (select public.current_clinic_id())
    and exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id and c.user_id = (select auth.uid())
    )
  );

create policy ai_messages_insert on public.ai_messages
  for insert to authenticated
  with check (
    clinic_id = (select public.current_clinic_id())
    and exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id and c.user_id = (select auth.uid())
    )
  );

-- ai_usage_log: gestão vê o consumo; ninguém escreve pelo cliente.
alter table public.ai_usage_log enable row level security;

create policy ai_usage_log_select on public.ai_usage_log
  for select to authenticated
  using (
    clinic_id = (select public.current_clinic_id())
    and (select public.has_clinic_role('owner','admin'))
  );

-- =============================================================================
-- Auditoria e verificação
-- =============================================================================
select private.attach_audit('public.employees');
select private.attach_audit('public.whatsapp_channels');
select private.attach_audit('public.workflows');

select private.assert_rls_coverage();
