-- =============================================================================
-- Conciliação bancária: contas, transações importadas e vínculo auditável
-- =============================================================================
--
-- NÃO APLICADA. Revisar no Supabase antes de executar.
--
-- Esta migration entrega o núcleo local da conciliação. A entrada automática
-- de extratos continua sendo um adapter de provedor externo; a clínica pode
-- cadastrar transações manualmente enquanto esse provedor não existe.
-- Nenhuma senha bancária ou token de terceiro entra no banco.
-- =============================================================================

begin;

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,

  name text not null,
  bank_name text,
  last_four text,
  is_active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, clinic_id)
);

create index if not exists bank_accounts_list_idx
  on public.bank_accounts (clinic_id, is_active, name);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  bank_account_id uuid not null,

  occurred_on date not null,
  direction text not null check (direction in ('credit', 'debit')),
  amount_cents integer not null check (amount_cents > 0),
  description text not null,
  external_id text,
  status text not null default 'pending'
    check (status in ('pending', 'reconciled', 'ignored')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, clinic_id),
  foreign key (bank_account_id, clinic_id)
    references public.bank_accounts(id, clinic_id)
    on delete restrict
);

create unique index if not exists bank_transactions_external_id_idx
  on public.bank_transactions (clinic_id, bank_account_id, external_id)
  where external_id is not null;

create index if not exists bank_transactions_pending_idx
  on public.bank_transactions (clinic_id, status, occurred_on desc);

create table if not exists public.bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  transaction_id uuid not null,
  invoice_id uuid,
  payable_id uuid,
  matched_amount_cents integer not null check (matched_amount_cents > 0),
  notes text,
  reconciled_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),

  unique (transaction_id),
  check ((invoice_id is not null) <> (payable_id is not null)),
  foreign key (transaction_id, clinic_id)
    references public.bank_transactions(id, clinic_id)
    on delete restrict
);

-- O id da linha já é globalmente único; estes índices compostos tornam o
-- tenant parte da referência para que uma conciliação não atravesse clínicas.
create unique index if not exists invoices_id_clinic_id_key
  on public.invoices (id, clinic_id);

create unique index if not exists payables_id_clinic_id_key
  on public.payables (id, clinic_id);

alter table public.bank_reconciliations
  add constraint bank_reconciliations_invoice_clinic_fkey
  foreign key (invoice_id, clinic_id)
  references public.invoices(id, clinic_id)
  on delete restrict;

alter table public.bank_reconciliations
  add constraint bank_reconciliations_payable_clinic_fkey
  foreign key (payable_id, clinic_id)
  references public.payables(id, clinic_id)
  on delete restrict;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;
alter table public.bank_reconciliations enable row level security;

drop policy if exists "bank_accounts_select" on public.bank_accounts;
create policy "bank_accounts_select"
  on public.bank_accounts
  for select to authenticated
  using (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'finance']::membership_role[]
    ));

drop policy if exists "bank_accounts_insert" on public.bank_accounts;
create policy "bank_accounts_insert"
  on public.bank_accounts
  for insert to authenticated
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(array['owner', 'admin']::membership_role[]));

drop policy if exists "bank_accounts_update" on public.bank_accounts;
create policy "bank_accounts_update"
  on public.bank_accounts
  for update to authenticated
  using (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(array['owner', 'admin']::membership_role[]))
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(array['owner', 'admin']::membership_role[]));

drop policy if exists "bank_transactions_select" on public.bank_transactions;
create policy "bank_transactions_select"
  on public.bank_transactions
  for select to authenticated
  using (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'finance']::membership_role[]
    ));

drop policy if exists "bank_transactions_insert" on public.bank_transactions;
create policy "bank_transactions_insert"
  on public.bank_transactions
  for insert to authenticated
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'finance']::membership_role[]
    ));

drop policy if exists "bank_transactions_update" on public.bank_transactions;
create policy "bank_transactions_update"
  on public.bank_transactions
  for update to authenticated
  using (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'finance']::membership_role[]
    ))
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'finance']::membership_role[]
    ));

drop policy if exists "bank_reconciliations_select" on public.bank_reconciliations;
create policy "bank_reconciliations_select"
  on public.bank_reconciliations
  for select to authenticated
  using (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'finance']::membership_role[]
    ));

drop policy if exists "bank_reconciliations_insert" on public.bank_reconciliations;
create policy "bank_reconciliations_insert"
  on public.bank_reconciliations
  for insert to authenticated
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'finance']::membership_role[]
    ));

-- Não há UPDATE nem DELETE: uma conciliação é uma evidência; correções devem
-- nascer como novo lançamento de ajuste, não apagar o histórico.

create or replace function public.reconcile_bank_transaction(
  p_clinic_id uuid,
  p_transaction_id uuid,
  p_invoice_id uuid,
  p_payable_id uuid,
  p_notes text
)
returns public.bank_reconciliations
language plpgsql
as $$
declare
  v_transaction public.bank_transactions;
  v_reconciliation public.bank_reconciliations;
begin
  if public.current_clinic_id() is distinct from p_clinic_id then
    raise exception 'clinic_scope' using errcode = '42501';
  end if;

  if (p_invoice_id is null) = (p_payable_id is null) then
    raise exception 'reconciliation_target_invalid' using errcode = '22023';
  end if;

  select * into v_transaction
  from public.bank_transactions
  where id = p_transaction_id and clinic_id = p_clinic_id
  for update;

  if not found then
    raise exception 'bank_transaction_not_found' using errcode = 'P0002';
  end if;

  if v_transaction.status <> 'pending' then
    raise exception 'bank_transaction_already_processed' using errcode = '22023';
  end if;

  if p_invoice_id is not null then
    if v_transaction.direction <> 'credit' or not exists (
      select 1 from public.invoices where id = p_invoice_id and clinic_id = p_clinic_id
    ) then
      raise exception 'invoice_reconciliation_invalid' using errcode = '22023';
    end if;
  else
    if v_transaction.direction <> 'debit' or not exists (
      select 1 from public.payables where id = p_payable_id and clinic_id = p_clinic_id
    ) then
      raise exception 'payable_reconciliation_invalid' using errcode = '22023';
    end if;
  end if;

  insert into public.bank_reconciliations (
    clinic_id,
    transaction_id,
    invoice_id,
    payable_id,
    matched_amount_cents,
    notes,
    reconciled_by
  ) values (
    p_clinic_id,
    v_transaction.id,
    p_invoice_id,
    p_payable_id,
    v_transaction.amount_cents,
    nullif(trim(p_notes), ''),
    auth.uid()
  ) returning * into v_reconciliation;

  update public.bank_transactions
  set status = 'reconciled',
      updated_at = now()
  where id = v_transaction.id and clinic_id = p_clinic_id;

  return v_reconciliation;
end;
$$;

revoke all on function public.reconcile_bank_transaction(uuid, uuid, uuid, uuid, text) from public;
grant execute on function public.reconcile_bank_transaction(uuid, uuid, uuid, uuid, text) to authenticated;

commit;

-- Verificar depois de aplicar:
-- select relrowsecurity from pg_class
--   where relname in ('bank_accounts', 'bank_transactions', 'bank_reconciliations');
-- select policyname, tablename, cmd from pg_policies
--   where tablename in ('bank_accounts', 'bank_transactions', 'bank_reconciliations');
-- Testar com duas clínicas e uma entrada/saída em cada: nenhuma transação,
-- conta ou vínculo da clínica A pode aparecer na clínica B.
-- Criar uma entrada e vinculá-la a uma invoice; criar uma saída e vinculá-la a
-- um payable; tentar inverter os sentidos e confirmar que o banco recusa.
-- Depois: npm run db:types
