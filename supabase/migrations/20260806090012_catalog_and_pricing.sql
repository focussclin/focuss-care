-- =============================================================================
-- Focuss Care · Onda 3 (Financeiro) · 0012 — Catálogo de serviços e preços
-- =============================================================================
-- REGRA DE OURO DO FINANCEIRO: dinheiro é `integer` de centavos. Nunca float,
-- nunca numeric para valor monetário de linha. 0.1 + 0.2 <> 0.3 em ponto
-- flutuante, e num sistema de faturamento isso vira divergência de caixa.
--
-- SEGUNDA REGRA: preço é histórico. Uma nota emitida em janeiro precisa mostrar
-- o preço de janeiro, mesmo que a tabela tenha mudado em março. Por isso
-- invoice_items guarda SNAPSHOT do preço, e não uma junção com price_list_items.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- services — procedimentos e serviços que a clínica oferece
-- -----------------------------------------------------------------------------
create table if not exists public.services (
  id                       uuid primary key default gen_random_uuid(),
  clinic_id                uuid not null references public.clinics(id) on delete cascade,
  code                     text,                    -- código interno
  tuss_code                text,                    -- TUSS, para faturamento de convênio
  name                     text not null,
  description              text,
  category                 text,
  default_duration_minutes smallint,
  default_price_cents      integer not null default 0,
  requires_authorization   boolean not null default false,  -- exige guia do convênio
  is_active                boolean not null default true,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz,

  unique (clinic_id, code),
  constraint services_price_non_negative    check (default_price_cents >= 0),
  constraint services_duration_sane         check (default_duration_minutes is null
                                                   or default_duration_minutes between 5 and 480)
);

create index if not exists services_clinic_active_idx
  on public.services (clinic_id) where is_active and deleted_at is null;
create index if not exists services_tuss_idx
  on public.services (clinic_id, tuss_code) where tuss_code is not null;

create trigger set_updated_at before update on public.services
  for each row execute function private.tg_set_updated_at();

comment on column public.services.requires_authorization is
  'Quando true, agendar pelo convênio exige guia aprovada. A regra é aplicada no use case, não no banco.';

-- -----------------------------------------------------------------------------
-- price_lists — uma tabela de preços por convênio; a particular é a de
-- insurance_plan_id nulo
-- -----------------------------------------------------------------------------
create table if not exists public.price_lists (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references public.clinics(id) on delete cascade,
  name        text not null,
  is_default  boolean not null default false,   -- a tabela particular
  valid_from  date,
  valid_until date,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint price_lists_date_order check (valid_until is null or valid_from is null
                                           or valid_until >= valid_from)
);

create unique index if not exists price_lists_single_default_idx
  on public.price_lists (clinic_id) where is_default and is_active;

create trigger set_updated_at before update on public.price_lists
  for each row execute function private.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- price_list_items — preço e regra de repasse por serviço
-- -----------------------------------------------------------------------------
create table if not exists public.price_list_items (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references public.clinics(id) on delete cascade,
  price_list_id uuid not null references public.price_lists(id) on delete cascade,
  service_id    uuid not null references public.services(id)    on delete cascade,
  price_cents   integer not null,

  -- Repasse ao profissional. Percentual OU valor fixo, nunca os dois.
  professional_share_percent numeric(5,2),
  professional_share_cents   integer,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (price_list_id, service_id),
  constraint price_list_items_price_non_negative check (price_cents >= 0),
  constraint price_list_items_percent_range
    check (professional_share_percent is null
           or professional_share_percent between 0 and 100),
  constraint price_list_items_share_exclusive
    check (professional_share_percent is null or professional_share_cents is null)
);

create index if not exists price_list_items_lookup_idx
  on public.price_list_items (clinic_id, price_list_id, service_id);

create trigger set_updated_at before update on public.price_list_items
  for each row execute function private.tg_set_updated_at();

comment on constraint price_list_items_share_exclusive on public.price_list_items is
  'Percentual e valor fixo são mutuamente exclusivos. Ter os dois preenchidos é a origem clássica da briga de repasse no fim do mês.';

-- -----------------------------------------------------------------------------
-- document_sequences — numeração sequencial POR CLÍNICA
-- -----------------------------------------------------------------------------
-- Uma SEQUENCE do Postgres é global e deixaria buracos entre clínicas (a
-- Clínica A veria suas notas numeradas 1, 7, 12). Contador por tenant com
-- trava de linha resolve, e é seguro sob concorrência.
-- -----------------------------------------------------------------------------
create table if not exists public.document_sequences (
  clinic_id  uuid not null references public.clinics(id) on delete cascade,
  kind       text not null,          -- 'invoice', 'receipt', ...
  last_value bigint not null default 0,
  primary key (clinic_id, kind)
);

create or replace function public.next_document_number(p_kind text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic uuid := public.current_clinic_id();
  v_next   bigint;
begin
  if v_clinic is null then
    raise exception 'Sem clínica ativa' using errcode = '42501';
  end if;

  insert into public.document_sequences (clinic_id, kind, last_value)
  values (v_clinic, p_kind, 1)
  on conflict (clinic_id, kind)
    do update set last_value = public.document_sequences.last_value + 1
  returning last_value into v_next;

  return v_next;
end;
$$;

revoke execute on function public.next_document_number(text) from anon;
grant  execute on function public.next_document_number(text) to authenticated;

comment on function public.next_document_number(text) is
  'ON CONFLICT DO UPDATE trava a linha: duas requisições simultâneas recebem números diferentes, sem buraco.';
