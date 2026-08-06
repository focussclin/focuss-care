-- =============================================================================
-- Focuss Care · Onda 3 (Financeiro) · 0015 — Caixa, contas a pagar e repasse
-- =============================================================================

do $$ begin
  create type public.cash_session_status as enum ('open','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.cash_entry_kind as enum ('in','out');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payout_status as enum ('draft','approved','paid','canceled');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- cash_sessions — abertura e fechamento de caixa
-- -----------------------------------------------------------------------------
create table if not exists public.cash_sessions (
  id                    uuid primary key default gen_random_uuid(),
  clinic_id             uuid not null references public.clinics(id) on delete cascade,
  status                public.cash_session_status not null default 'open',

  opened_by             uuid references public.profiles(id) on delete set null,
  opened_at             timestamptz not null default now(),
  opening_amount_cents  integer not null default 0,

  closed_by             uuid references public.profiles(id) on delete set null,
  closed_at             timestamptz,
  expected_amount_cents integer,     -- calculado no fechamento
  counted_amount_cents  integer,     -- contado fisicamente
  difference_cents      integer generated always as
                          (counted_amount_cents - expected_amount_cents) stored,

  notes                 text,
  created_at            timestamptz not null default now(),

  constraint cash_sessions_opening_non_negative check (opening_amount_cents >= 0),
  constraint cash_sessions_closed_complete
    check (status <> 'closed' or (closed_at is not null and counted_amount_cents is not null))
);

-- Um caixa aberto por vez, por clínica.
create unique index if not exists cash_sessions_single_open_idx
  on public.cash_sessions (clinic_id) where status = 'open';

create index if not exists cash_sessions_period_idx
  on public.cash_sessions (clinic_id, opened_at desc);

comment on column public.cash_sessions.difference_cents is
  'Quebra de caixa. Positivo = sobra, negativo = falta. Coluna calculada: ninguém "ajusta" a diferença.';

-- Agora que cash_sessions existe, fecha a FK que ficou pendente em 0014.
alter table public.payments
  drop constraint if exists payments_cash_session_fk;
alter table public.payments
  add constraint payments_cash_session_fk
  foreign key (cash_session_id) references public.cash_sessions(id) on delete set null;

-- -----------------------------------------------------------------------------
-- cash_entries — todo movimento do caixa
-- -----------------------------------------------------------------------------
create table if not exists public.cash_entries (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  cash_session_id uuid not null references public.cash_sessions(id) on delete restrict,
  kind            public.cash_entry_kind not null,
  category        text,                       -- 'recebimento', 'sangria', 'troco', 'estorno'
  amount_cents    integer not null,
  description     text not null,
  payment_id      uuid references public.payments(id) on delete set null,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),

  constraint cash_entries_amount_positive check (amount_cents > 0)
);

create index if not exists cash_entries_session_idx
  on public.cash_entries (clinic_id, cash_session_id, created_at);

-- Movimento de caixa é lançamento: imutável. Corrigir é lançar o estorno.
create trigger cash_entries_immutable_trg
  before update or delete on public.cash_entries
  for each row execute function private.tg_forbid_mutation();

comment on column public.cash_entries.amount_cents is
  'Sempre positivo. A direção vem de `kind`. Guardar negativo em "saída" duplica a regra e vira erro de sinal na soma.';

-- Fechamento de caixa: calcula o esperado e trava a sessão.
create or replace function public.close_cash_session(
  p_session_id uuid,
  p_counted_cents integer,
  p_notes text default null
)
returns public.cash_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session  public.cash_sessions;
  v_expected integer;
begin
  select * into v_session from public.cash_sessions
   where id = p_session_id and clinic_id = public.current_clinic_id()
   for update;

  if v_session.id is null then
    raise exception 'Caixa não encontrado' using errcode = '22023';
  end if;
  if v_session.status = 'closed' then
    raise exception 'Caixa já fechado' using errcode = '22023';
  end if;

  select v_session.opening_amount_cents
         + coalesce(sum(case when kind = 'in'  then amount_cents else 0 end), 0)
         - coalesce(sum(case when kind = 'out' then amount_cents else 0 end), 0)
    into v_expected
  from public.cash_entries where cash_session_id = p_session_id;

  update public.cash_sessions
     set status                = 'closed',
         closed_by             = auth.uid(),
         closed_at             = now(),
         expected_amount_cents = v_expected,
         counted_amount_cents  = p_counted_cents,
         notes                 = coalesce(p_notes, notes)
   where id = p_session_id
   returning * into v_session;

  return v_session;
end;
$$;

revoke execute on function public.close_cash_session(uuid, integer, text) from anon;
grant  execute on function public.close_cash_session(uuid, integer, text) to authenticated;

-- -----------------------------------------------------------------------------
-- payables — contas a pagar
-- -----------------------------------------------------------------------------
create table if not exists public.payables (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references public.clinics(id) on delete cascade,
  description    text not null,
  category       text,                     -- 'aluguel', 'material', 'folha', 'imposto'
  supplier       text,
  amount_cents   integer not null,
  due_date       date not null,
  paid_at        timestamptz,
  paid_amount_cents integer,
  method         public.payment_method,
  is_recurring   boolean not null default false,
  notes          text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint payables_amount_positive check (amount_cents > 0)
);

create index if not exists payables_due_idx
  on public.payables (clinic_id, due_date) where paid_at is null;

create trigger set_updated_at before update on public.payables
  for each row execute function private.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- professional_payouts — repasse ao profissional
-- -----------------------------------------------------------------------------
create table if not exists public.professional_payouts (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references public.clinics(id) on delete cascade,
  professional_id  uuid not null references public.professionals(id) on delete restrict,
  period_start     date not null,
  period_end       date not null,
  status           public.payout_status not null default 'draft',
  gross_cents      integer not null default 0,
  deductions_cents integer not null default 0,
  net_cents        integer generated always as (gross_cents - deductions_cents) stored,
  paid_at          timestamptz,
  notes            text,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (clinic_id, professional_id, period_start, period_end),
  constraint payouts_period_order check (period_end >= period_start),
  constraint payouts_amounts_non_negative check (gross_cents >= 0 and deductions_cents >= 0)
);

create index if not exists professional_payouts_prof_idx
  on public.professional_payouts (clinic_id, professional_id, period_end desc);

create trigger set_updated_at before update on public.professional_payouts
  for each row execute function private.tg_set_updated_at();

create table if not exists public.professional_payout_items (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references public.clinics(id) on delete cascade,
  payout_id       uuid not null references public.professional_payouts(id) on delete cascade,
  invoice_item_id uuid not null references public.invoice_items(id) on delete restrict,
  amount_cents    integer not null,

  unique (payout_id, invoice_item_id)
);

create index if not exists professional_payout_items_idx
  on public.professional_payout_items (clinic_id, payout_id);

comment on table public.professional_payout_items is
  'Liga o repasse ao item de nota que o gerou. Sem essa ligação, "por que meu repasse deu esse valor?" não tem resposta auditável.';

-- -----------------------------------------------------------------------------
-- Prévia do repasse: soma o que é devido no período, a partir dos snapshots
-- -----------------------------------------------------------------------------
create or replace function public.preview_professional_payout(
  p_professional_id uuid,
  p_start date,
  p_end   date
)
returns table (
  invoice_item_id uuid,
  invoice_number  bigint,
  description     text,
  paid_at         date,
  item_total_cents integer,
  share_cents     integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ii.id,
    i.number,
    ii.description,
    i.issue_date,
    ii.total_cents,
    coalesce(
      ii.professional_share_cents,
      (round(ii.total_cents * coalesce(ii.professional_share_percent, 0) / 100.0))::integer
    ) as share_cents
  from public.invoice_items ii
  join public.invoices i on i.id = ii.invoice_id
  where ii.clinic_id       = public.current_clinic_id()
    and ii.professional_id = p_professional_id
    and i.status           = 'paid'                      -- só repassa o que entrou
    and i.issue_date between p_start and p_end
    and not exists (
      select 1 from public.professional_payout_items pi
      where pi.invoice_item_id = ii.id                   -- e ainda não foi repassado
    )
  order by i.issue_date, i.number;
$$;

revoke execute on function public.preview_professional_payout(uuid, date, date) from anon;
grant  execute on function public.preview_professional_payout(uuid, date, date) to authenticated;

comment on function public.preview_professional_payout(uuid, date, date) is
  'Só considera notas PAGAS e itens ainda não repassados. Repassar sobre nota emitida e não recebida é como clínica descapitaliza sem perceber.';
