-- =============================================================================
-- Focuss Care · Onda 3 (Financeiro) · 0016 — RLS do financeiro
-- =============================================================================
-- Três níveis de acesso nesta onda:
--
--   CATÁLOGO   (serviços, preços, convênios)
--     → todo membro lê. A recepção precisa saber preço para agendar.
--
--   OPERAÇÃO   (notas, pagamentos, caixa)
--     → owner, admin, finance E receptionist. A recepção recebe pagamento.
--
--   GESTÃO     (contas a pagar, repasse ao profissional)
--     → owner, admin, finance. E cada profissional vê o PRÓPRIO repasse.
--
-- Nenhum papel financeiro alcança conteúdo clínico, e vice-versa.
-- =============================================================================

create or replace function public.can_access_financial()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.current_clinic_role() in ('owner','admin','finance');
$$;

create or replace function public.can_handle_billing()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.current_clinic_role() in ('owner','admin','finance','receptionist');
$$;

comment on function public.can_access_financial() is
  'Gestão financeira: contas a pagar, repasse, fechamento. Recepção fica de fora.';
comment on function public.can_handle_billing() is
  'Operação de balcão: emitir nota e receber pagamento. Inclui a recepção.';

-- =============================================================================
-- CATÁLOGO — leitura para todos, escrita restrita
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'services','price_lists','price_list_items',
    'insurance_providers','insurance_plans'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);

    execute format($f$
      create policy %1$s_select on public.%1$I
        for select to authenticated
        using (clinic_id = (select public.current_clinic_id()))
    $f$, t);

    execute format($f$
      create policy %1$s_write on public.%1$I
        for all to authenticated
        using      (clinic_id = (select public.current_clinic_id())
                    and (select public.can_access_financial()))
        with check (clinic_id = (select public.current_clinic_id())
                    and (select public.can_access_financial()))
    $f$, t);
  end loop;
end $$;

-- document_sequences: só o servidor mexe (via next_document_number)
alter table public.document_sequences enable row level security;
create policy document_sequences_select on public.document_sequences
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id())
         and (select public.can_access_financial()));

-- =============================================================================
-- CONVÊNIO DO PACIENTE — a recepção precisa conferir carteirinha
-- =============================================================================
alter table public.patient_insurances enable row level security;
alter table public.patient_insurances force  row level security;

create policy patient_insurances_select on public.patient_insurances
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()));

create policy patient_insurances_write on public.patient_insurances
  for all to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and (select public.can_handle_billing()))
  with check (clinic_id = (select public.current_clinic_id()) and (select public.can_handle_billing()));

alter table public.insurance_authorizations enable row level security;
alter table public.insurance_authorizations force  row level security;

create policy insurance_authorizations_select on public.insurance_authorizations
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()));

create policy insurance_authorizations_write on public.insurance_authorizations
  for all to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and (select public.can_handle_billing()))
  with check (clinic_id = (select public.current_clinic_id()) and (select public.can_handle_billing()));

-- =============================================================================
-- FATURAMENTO
-- =============================================================================
alter table public.invoices enable row level security;
alter table public.invoices force  row level security;

-- O profissional vê as notas dos próprios atendimentos (conferir o repasse).
create policy invoices_select on public.invoices
  for select to authenticated
  using (
    clinic_id = (select public.current_clinic_id())
    and (
      (select public.can_handle_billing())
      or exists (
        select 1 from public.invoice_items ii
        where ii.invoice_id = invoices.id
          and ii.professional_id = (select public.current_professional_id())
      )
    )
  );

create policy invoices_insert on public.invoices
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id()) and (select public.can_handle_billing()));

create policy invoices_update on public.invoices
  for update to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and (select public.can_handle_billing()))
  with check (clinic_id = (select public.current_clinic_id()));

-- Sem DELETE: nota se cancela, não se apaga.

alter table public.invoice_items enable row level security;
alter table public.invoice_items force  row level security;

create policy invoice_items_select on public.invoice_items
  for select to authenticated
  using (
    clinic_id = (select public.current_clinic_id())
    and (
      (select public.can_handle_billing())
      or professional_id = (select public.current_professional_id())
    )
  );

create policy invoice_items_write on public.invoice_items
  for all to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and (select public.can_handle_billing()))
  with check (clinic_id = (select public.current_clinic_id()) and (select public.can_handle_billing()));

alter table public.payments enable row level security;
alter table public.payments force  row level security;

create policy payments_select on public.payments
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()) and (select public.can_handle_billing()));

create policy payments_insert on public.payments
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id()) and (select public.can_handle_billing()));

-- Sem UPDATE/DELETE: pagamento é imutável (gatilho reforça).

-- =============================================================================
-- CAIXA
-- =============================================================================
alter table public.cash_sessions enable row level security;
alter table public.cash_sessions force  row level security;

create policy cash_sessions_select on public.cash_sessions
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()) and (select public.can_handle_billing()));

create policy cash_sessions_insert on public.cash_sessions
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id()) and (select public.can_handle_billing()));

create policy cash_sessions_update on public.cash_sessions
  for update to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and (select public.can_handle_billing()))
  with check (clinic_id = (select public.current_clinic_id()));

alter table public.cash_entries enable row level security;
alter table public.cash_entries force  row level security;

create policy cash_entries_select on public.cash_entries
  for select to authenticated
  using (clinic_id = (select public.current_clinic_id()) and (select public.can_handle_billing()));

create policy cash_entries_insert on public.cash_entries
  for insert to authenticated
  with check (clinic_id = (select public.current_clinic_id()) and (select public.can_handle_billing()));

-- =============================================================================
-- GESTÃO — recepção não entra
-- =============================================================================
alter table public.payables enable row level security;
alter table public.payables force  row level security;

create policy payables_all on public.payables
  for all to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and (select public.can_access_financial()))
  with check (clinic_id = (select public.current_clinic_id()) and (select public.can_access_financial()));

alter table public.professional_payouts enable row level security;
alter table public.professional_payouts force  row level security;

-- Gestão vê tudo; cada profissional vê o próprio repasse.
create policy professional_payouts_select on public.professional_payouts
  for select to authenticated
  using (
    clinic_id = (select public.current_clinic_id())
    and (
      (select public.can_access_financial())
      or professional_id = (select public.current_professional_id())
    )
  );

create policy professional_payouts_write on public.professional_payouts
  for all to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and (select public.can_access_financial()))
  with check (clinic_id = (select public.current_clinic_id()) and (select public.can_access_financial()));

alter table public.professional_payout_items enable row level security;
alter table public.professional_payout_items force  row level security;

create policy professional_payout_items_select on public.professional_payout_items
  for select to authenticated
  using (
    clinic_id = (select public.current_clinic_id())
    and (
      (select public.can_access_financial())
      or exists (
        select 1 from public.professional_payouts p
        where p.id = professional_payout_items.payout_id
          and p.professional_id = (select public.current_professional_id())
      )
    )
  );

create policy professional_payout_items_write on public.professional_payout_items
  for all to authenticated
  using      (clinic_id = (select public.current_clinic_id()) and (select public.can_access_financial()))
  with check (clinic_id = (select public.current_clinic_id()) and (select public.can_access_financial()));

-- =============================================================================
-- Auditoria e verificação
-- =============================================================================
select private.attach_audit('public.invoices');
select private.attach_audit('public.payments');
select private.attach_audit('public.cash_sessions');
select private.attach_audit('public.professional_payouts');
select private.attach_audit('public.price_list_items');

select private.assert_rls_coverage();
