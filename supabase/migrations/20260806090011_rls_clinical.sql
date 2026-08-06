-- =============================================================================
-- Focuss Care · Onda 2 (Núcleo clínico) · 0011 — RLS, auditoria e log de acesso
-- =============================================================================
-- Duas fronteiras distintas nesta onda:
--
--   OPERACIONAL  (paciente, agenda, fila, atendimento)
--     → todo membro da clínica lê. Recepção precisa disso para trabalhar.
--
--   CLÍNICO      (prontuário, sinais vitais, alergia, prescrição, anexo)
--     → somente can_access_clinical(). Recepção e financeiro NUNCA.
--
-- A segunda fronteira é a que sobrevive a uma auditoria. A primeira é a que
-- faz a clínica funcionar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: qual profissional é o usuário logado nesta clínica
-- -----------------------------------------------------------------------------
create or replace function public.current_professional_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.professionals p
  where p.clinic_id = public.current_clinic_id()
    and p.user_id   = auth.uid()
    and p.is_active
    and p.deleted_at is null
  limit 1;
$$;

comment on function public.current_professional_id() is
  'Impede forjar autoria: a policy de insert de prontuário exige author_id = este valor.';

-- =============================================================================
-- CAMADA OPERACIONAL
-- =============================================================================

-- patients ---------------------------------------------------------------------
alter table public.patients enable row level security;
alter table public.patients force  row level security;

create policy patients_select on public.patients
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()));

create policy patients_insert on public.patients
  for insert to authenticated
  with check (
    clinic_id = (select public.current_clinic_id())
    and (select public.has_clinic_role('owner','admin','professional','receptionist'))
  );

create policy patients_update on public.patients
  for update to authenticated
  using      (clinic_id = (select public.current_clinic_id())
              and (select public.has_clinic_role('owner','admin','professional','receptionist')))
  with check (clinic_id = (select public.current_clinic_id()));

-- Sem DELETE: inativação é `deleted_at`. Paciente apagado deixa prontuário órfão,
-- e o prontuário tem retenção legal de 20 anos.

-- patient_contacts --------------------------------------------------------------
alter table public.patient_contacts enable row level security;
alter table public.patient_contacts force  row level security;

create policy patient_contacts_select on public.patient_contacts
  for select to authenticated using (clinic_id = (select public.current_clinic_id()));

create policy patient_contacts_write on public.patient_contacts
  for all to authenticated
  using      (clinic_id = (select public.current_clinic_id())
              and (select public.has_clinic_role('owner','admin','professional','receptionist')))
  with check (clinic_id = (select public.current_clinic_id())
              and (select public.has_clinic_role('owner','admin','professional','receptionist')));

-- patient_documents -------------------------------------------------------------
alter table public.patient_documents enable row level security;
alter table public.patient_documents force  row level security;

create policy patient_documents_select on public.patient_documents
  for select to authenticated using (clinic_id = (select public.current_clinic_id()));

create policy patient_documents_insert on public.patient_documents
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id())
              and (select public.has_clinic_role('owner','admin','professional','receptionist')));

create policy patient_documents_delete on public.patient_documents
  for delete to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.has_clinic_role('owner','admin')));

-- availability ------------------------------------------------------------------
alter table public.availability_rules enable row level security;
alter table public.availability_rules force  row level security;

create policy availability_rules_select on public.availability_rules
  for select to authenticated using (clinic_id = (select public.current_clinic_id()));

create policy availability_rules_write on public.availability_rules
  for all to authenticated
  using (
    clinic_id = (select public.current_clinic_id())
    and (
      (select public.has_clinic_role('owner','admin'))
      or professional_id = (select public.current_professional_id())  -- gere a própria agenda
    )
  )
  with check (clinic_id = (select public.current_clinic_id()));

alter table public.availability_exceptions enable row level security;
alter table public.availability_exceptions force  row level security;

create policy availability_exceptions_select on public.availability_exceptions
  for select to authenticated using (clinic_id = (select public.current_clinic_id()));

create policy availability_exceptions_write on public.availability_exceptions
  for all to authenticated
  using (
    clinic_id = (select public.current_clinic_id())
    and (
      (select public.has_clinic_role('owner','admin','receptionist'))
      or professional_id = (select public.current_professional_id())
    )
  )
  with check (clinic_id = (select public.current_clinic_id()));

-- appointments ------------------------------------------------------------------
alter table public.appointments enable row level security;
alter table public.appointments force  row level security;

create policy appointments_select on public.appointments
  for select to authenticated using (clinic_id = (select public.current_clinic_id()));

create policy appointments_insert on public.appointments
  for insert to authenticated
  with check (
    clinic_id = (select public.current_clinic_id())
    and (select public.has_clinic_role('owner','admin','professional','receptionist'))
  );

create policy appointments_update on public.appointments
  for update to authenticated
  using      (clinic_id = (select public.current_clinic_id())
              and (select public.has_clinic_role('owner','admin','professional','receptionist')))
  with check (clinic_id = (select public.current_clinic_id()));

-- Sem DELETE: cancelar é `status = 'canceled'`. Agendamento apagado some do
-- histórico de faltas e da conferência de faturamento.

alter table public.appointment_status_history enable row level security;

create policy appointment_status_history_select on public.appointment_status_history
  for select to authenticated using (clinic_id = (select public.current_clinic_id()));
-- Escrita só por gatilho.

-- waiting_queue -----------------------------------------------------------------
alter table public.waiting_queue enable row level security;
alter table public.waiting_queue force  row level security;

create policy waiting_queue_select on public.waiting_queue
  for select to authenticated using (clinic_id = (select public.current_clinic_id()));

create policy waiting_queue_write on public.waiting_queue
  for all to authenticated
  using      (clinic_id = (select public.current_clinic_id())
              and (select public.has_clinic_role('owner','admin','professional','receptionist')))
  with check (clinic_id = (select public.current_clinic_id())
              and (select public.has_clinic_role('owner','admin','professional','receptionist')));

-- encounters --------------------------------------------------------------------
-- Legível por todo membro: a recepção precisa saber quem está em atendimento.
-- Por isso `chief_complaint` guarda a queixa DECLARADA pelo paciente (a mesma
-- que já aparece em appointments.reason). Avaliação clínica vai em
-- medical_records, que a recepção não alcança.
alter table public.encounters enable row level security;
alter table public.encounters force  row level security;

create policy encounters_select on public.encounters
  for select to authenticated using (clinic_id = (select public.current_clinic_id()));

create policy encounters_insert on public.encounters
  for insert to authenticated
  with check (
    clinic_id = (select public.current_clinic_id())
    and (select public.can_access_clinical())
  );

create policy encounters_update on public.encounters
  for update to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and (select public.can_access_clinical()))
  with check (clinic_id = (select public.current_clinic_id()));

-- =============================================================================
-- CAMADA CLÍNICA — somente can_access_clinical()
-- =============================================================================

-- medical_records ---------------------------------------------------------------
alter table public.medical_records enable row level security;
alter table public.medical_records force  row level security;

create policy medical_records_select on public.medical_records
  for select to authenticated
  using (
    clinic_id = (select public.current_clinic_id())
    and (select public.can_access_clinical())
  );

-- A autoria não pode ser forjada: author_id tem de ser o profissional logado.
create policy medical_records_insert on public.medical_records
  for insert to authenticated
  with check (
    clinic_id = (select public.current_clinic_id())
    and (select public.can_access_clinical())
    and author_id = (select public.current_professional_id())
  );

-- Sem policy de UPDATE nem DELETE. Além disso o gatilho de imutabilidade
-- bloqueia até quem tentar pela chave de serviço.

-- vitals ------------------------------------------------------------------------
alter table public.vitals enable row level security;
alter table public.vitals force  row level security;

create policy vitals_select on public.vitals
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()) and (select public.can_access_clinical()));

create policy vitals_insert on public.vitals
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id()) and (select public.can_access_clinical()));

-- allergies ---------------------------------------------------------------------
alter table public.allergies enable row level security;
alter table public.allergies force  row level security;

create policy allergies_select on public.allergies
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()) and (select public.can_access_clinical()));

create policy allergies_write on public.allergies
  for all to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and (select public.can_access_clinical()))
  with check (clinic_id = (select public.current_clinic_id()) and (select public.can_access_clinical()));

-- prescriptions -----------------------------------------------------------------
alter table public.prescriptions enable row level security;
alter table public.prescriptions force  row level security;

create policy prescriptions_select on public.prescriptions
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()) and (select public.can_access_clinical()));

create policy prescriptions_insert on public.prescriptions
  for insert to authenticated
  with check (
    clinic_id = (select public.current_clinic_id())
    and (select public.can_access_clinical())
    and author_id = (select public.current_professional_id())
  );

alter table public.prescription_items enable row level security;
alter table public.prescription_items force  row level security;

create policy prescription_items_select on public.prescription_items
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()) and (select public.can_access_clinical()));

create policy prescription_items_insert on public.prescription_items
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id()) and (select public.can_access_clinical()));

-- clinical_attachments ----------------------------------------------------------
alter table public.clinical_attachments enable row level security;
alter table public.clinical_attachments force  row level security;

create policy clinical_attachments_select on public.clinical_attachments
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()) and (select public.can_access_clinical()));

create policy clinical_attachments_insert on public.clinical_attachments
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id()) and (select public.can_access_clinical()));

create policy clinical_attachments_delete on public.clinical_attachments
  for delete to authenticated
  using (clinic_id = (select public.current_clinic_id()) and (select public.has_clinic_role('owner','admin')));

-- =============================================================================
-- Auditoria
-- =============================================================================
select private.attach_audit('public.patients');
select private.attach_audit('public.appointments');
select private.attach_audit('public.encounters');
select private.attach_audit('public.medical_records');
select private.attach_audit('public.prescriptions');
select private.attach_audit('public.allergies');
select private.attach_audit('public.clinical_attachments');

-- -----------------------------------------------------------------------------
-- Log de LEITURA de prontuário
-- -----------------------------------------------------------------------------
-- O Postgres não tem gatilho de SELECT. Como a clínica optou por prontuário
-- legível por todos os profissionais, o registro de quem LEU o quê é o
-- principal controle compensatório — e precisa ser chamado pela aplicação,
-- no use case de abrir prontuário.
-- -----------------------------------------------------------------------------
create or replace function public.log_clinical_access(
  p_patient_id  uuid,
  p_entity_type text default 'medical_records',
  p_entity_id   uuid default null,
  p_purpose     text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic uuid := public.current_clinic_id();
begin
  if v_clinic is null or not public.can_access_clinical() then
    raise exception 'Sem permissão de acesso clínico' using errcode = '42501';
  end if;

  insert into public.audit_log
    (clinic_id, actor_user_id, actor_role, action, entity_type, entity_id, after)
  values
    (v_clinic, auth.uid(), public.current_clinic_role(), 'READ',
     p_entity_type, coalesce(p_entity_id, p_patient_id),
     jsonb_build_object('patient_id', p_patient_id, 'purpose', p_purpose));
end;
$$;

revoke execute on function public.log_clinical_access(uuid, text, uuid, text) from anon;
grant  execute on function public.log_clinical_access(uuid, text, uuid, text) to authenticated;

-- =============================================================================
-- Verificação
-- =============================================================================
select private.assert_rls_coverage();
