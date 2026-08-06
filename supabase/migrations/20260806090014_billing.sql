-- =============================================================================
-- Focuss Care · Onda 3 (Financeiro) · 0014 — Faturamento e recebimentos
-- =============================================================================
-- CICLO DE VIDA DA NOTA:
--
--   draft ──emitir──> issued ──pagamento──> partially_paid ──> paid
--     │                  │
--     └── editável       └── FINANCEIRAMENTE CONGELADA
--                            (só status, pagamento e cancelamento mudam)
--
-- Nota emitida que continua editável é nota que não vale nada na conferência
-- de caixa. O congelamento é feito por gatilho, não por disciplina da equipe.
-- =============================================================================

do $$ begin
  create type public.invoice_status as enum
    ('draft','issued','partially_paid','paid','overdue','canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payer_type as enum ('patient','insurance');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method as enum
    ('cash','pix','debit_card','credit_card','bank_transfer','insurance','check','other');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- invoices
-- -----------------------------------------------------------------------------
create table if not exists public.invoices (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references public.clinics(id) on delete cascade,
  number            bigint,                    -- sequencial por clínica, atribuído na emissão

  payer_type        public.payer_type not null default 'patient',
  patient_id        uuid not null references public.patients(id) on delete restrict,
  insurance_plan_id uuid references public.insurance_plans(id) on delete restrict,

  encounter_id      uuid references public.encounters(id) on delete set null,
  appointment_id    uuid references public.appointments(id) on delete set null,

  status            public.invoice_status not null default 'draft',
  issue_date        date,
  due_date          date,

  subtotal_cents    integer not null default 0,
  discount_cents    integer not null default 0,
  total_cents       integer not null default 0,
  paid_cents        integer not null default 0,

  notes             text,
  canceled_at       timestamptz,
  cancel_reason     text,

  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (clinic_id, number),
  constraint invoices_amounts_non_negative
    check (subtotal_cents >= 0 and discount_cents >= 0 and total_cents >= 0 and paid_cents >= 0),
  constraint invoices_insurance_requires_plan
    check (payer_type <> 'insurance' or insurance_plan_id is not null),
  constraint invoices_issued_has_number
    check (status = 'draft' or number is not null),
  constraint invoices_canceled_has_reason
    check (status <> 'canceled' or cancel_reason is not null)
);

create index if not exists invoices_clinic_status_idx
  on public.invoices (clinic_id, status, due_date);
create index if not exists invoices_patient_idx
  on public.invoices (clinic_id, patient_id, issue_date desc);
create index if not exists invoices_open_idx
  on public.invoices (clinic_id, due_date)
  where status in ('issued','partially_paid','overdue');

create trigger set_updated_at before update on public.invoices
  for each row execute function private.tg_set_updated_at();

-- ★ Congelamento financeiro após a emissão
create or replace function private.tg_invoice_freeze()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'draft' then
    return new;                      -- rascunho é livre
  end if;

  if (new.payer_type       is distinct from old.payer_type)
  or (new.patient_id       is distinct from old.patient_id)
  or (new.insurance_plan_id is distinct from old.insurance_plan_id)
  or (new.subtotal_cents   is distinct from old.subtotal_cents)
  or (new.discount_cents   is distinct from old.discount_cents)
  or (new.total_cents      is distinct from old.total_cents)
  or (new.number           is distinct from old.number)
  or (new.issue_date       is distinct from old.issue_date)
  then
    raise exception
      'Nota % já emitida: valores não podem ser alterados. Cancele e emita outra.',
      coalesce(old.number::text, old.id::text)
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger invoices_freeze_trg
  before update on public.invoices
  for each row execute function private.tg_invoice_freeze();

-- -----------------------------------------------------------------------------
-- invoice_items — com SNAPSHOT de preço e de regra de repasse
-- -----------------------------------------------------------------------------
create table if not exists public.invoice_items (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  invoice_id      uuid not null references public.invoices(id) on delete cascade,
  service_id      uuid references public.services(id) on delete set null,

  -- SNAPSHOTS: nunca ler o preço atual para exibir uma nota antiga.
  description     text not null,
  quantity        numeric(10,2) not null default 1,
  unit_price_cents integer not null,
  discount_cents  integer not null default 0,
  total_cents     integer generated always as
                    ((round(quantity * unit_price_cents))::integer - discount_cents) stored,

  -- Execução e repasse, também congelados no momento do lançamento.
  professional_id            uuid references public.professionals(id) on delete set null,
  professional_share_percent numeric(5,2),
  professional_share_cents   integer,

  created_at      timestamptz not null default now(),

  constraint invoice_items_quantity_positive check (quantity > 0),
  constraint invoice_items_price_non_negative check (unit_price_cents >= 0 and discount_cents >= 0)
);

create index if not exists invoice_items_invoice_idx
  on public.invoice_items (clinic_id, invoice_id);
create index if not exists invoice_items_professional_idx
  on public.invoice_items (clinic_id, professional_id) where professional_id is not null;

comment on column public.invoice_items.unit_price_cents is
  'Cópia do preço no momento do lançamento. Tabela de preços muda; nota emitida não.';
comment on column public.invoice_items.professional_share_percent is
  'Cópia da regra de repasse vigente. Sem isso, alterar a regra hoje reescreveria o repasse de meses fechados.';

-- Itens só mudam enquanto a nota é rascunho
create or replace function private.tg_invoice_items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status public.invoice_status;
  v_row    record;
begin
  v_row := case tg_op when 'DELETE' then old else new end;
  select status into v_status from public.invoices where id = v_row.invoice_id;

  if v_status is distinct from 'draft' then
    raise exception 'Nota não é rascunho: itens não podem ser alterados.'
      using errcode = '42501';
  end if;

  return v_row;
end;
$$;

create trigger invoice_items_guard_trg
  before insert or update or delete on public.invoice_items
  for each row execute function private.tg_invoice_items_guard();

-- Recalcula os totais da nota a partir dos itens
create or replace function private.tg_invoice_recalc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
  v_subtotal integer;
begin
  select coalesce(sum(total_cents), 0) into v_subtotal
  from public.invoice_items where invoice_id = v_invoice;

  update public.invoices
     set subtotal_cents = v_subtotal,
         total_cents    = greatest(v_subtotal - discount_cents, 0)
   where id = v_invoice;

  return null;
end;
$$;

create trigger invoice_items_recalc_trg
  after insert or update or delete on public.invoice_items
  for each row execute function private.tg_invoice_recalc();

-- -----------------------------------------------------------------------------
-- payments
-- -----------------------------------------------------------------------------
create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  invoice_id      uuid not null references public.invoices(id) on delete restrict,
  amount_cents    integer not null,
  method          public.payment_method not null,
  paid_at         timestamptz not null default now(),
  installments    smallint not null default 1,
  external_id     text,                    -- id na maquininha / gateway
  cash_session_id uuid,                    -- FK adicionada em 0015
  notes           text,
  received_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint payments_amount_positive     check (amount_cents > 0),
  constraint payments_installments_range  check (installments between 1 and 48)
);

create index if not exists payments_invoice_idx  on public.payments (clinic_id, invoice_id);
create index if not exists payments_period_idx   on public.payments (clinic_id, paid_at desc);
create index if not exists payments_method_idx   on public.payments (clinic_id, method, paid_at desc);

-- Pagamento é lançamento contábil: não se edita nem se apaga. Corrigir é estornar.
create trigger payments_immutable_trg
  before update or delete on public.payments
  for each row execute function private.tg_forbid_mutation();

-- Atualiza paid_cents e o status da nota
create or replace function private.tg_payment_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paid  integer;
  v_total integer;
  v_due   date;
begin
  select coalesce(sum(amount_cents), 0) into v_paid
  from public.payments where invoice_id = new.invoice_id;

  select total_cents, due_date into v_total, v_due
  from public.invoices where id = new.invoice_id;

  update public.invoices
     set paid_cents = v_paid,
         status = case
                    when status = 'canceled'            then 'canceled'
                    when v_paid >= v_total and v_total > 0 then 'paid'
                    when v_paid > 0                     then 'partially_paid'
                    when v_due is not null and v_due < current_date then 'overdue'
                    else status
                  end
   where id = new.invoice_id;

  return null;
end;
$$;

create trigger payments_apply_trg
  after insert on public.payments
  for each row execute function private.tg_payment_apply();

comment on table public.payments is
  'Imutável. Estorno é um novo pagamento negativo? Não — é um registro em cash_entries de saída, mantendo o histórico legível.';

-- -----------------------------------------------------------------------------
-- Emissão: atribui número e congela a nota
-- -----------------------------------------------------------------------------
create or replace function public.issue_invoice(p_invoice_id uuid, p_due_date date default null)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices;
begin
  select * into v_inv from public.invoices
   where id = p_invoice_id and clinic_id = public.current_clinic_id()
   for update;

  if v_inv.id is null then
    raise exception 'Nota não encontrada' using errcode = '22023';
  end if;
  if v_inv.status <> 'draft' then
    raise exception 'Nota já emitida' using errcode = '22023';
  end if;
  if v_inv.total_cents <= 0 then
    raise exception 'Nota sem itens não pode ser emitida' using errcode = '22023';
  end if;

  update public.invoices
     set number     = public.next_document_number('invoice'),
         status     = 'issued',
         issue_date = current_date,
         due_date   = coalesce(p_due_date, current_date)
   where id = p_invoice_id
   returning * into v_inv;

  return v_inv;
end;
$$;

revoke execute on function public.issue_invoice(uuid, date) from anon;
grant  execute on function public.issue_invoice(uuid, date) to authenticated;
