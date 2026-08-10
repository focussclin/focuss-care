-- =============================================================================
-- Compras da clínica: fornecedores, pedidos e recebimento no estoque
-- =============================================================================
--
-- NÃO APLICADA. Revisar no Supabase antes de executar.
--
-- A tela de Compras não é uma lista decorativa: cada pedido possui linhas
-- ligadas a itens do estoque e o recebimento atualiza o saldo dentro da mesma
-- transação do banco. A integração com contas a pagar pode nascer depois sem
-- misturar o lançamento financeiro com o recebimento físico.
-- =============================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'purchase_order_status') then
    create type public.purchase_order_status as enum (
      'draft',
      'requested',
      'approved',
      'ordered',
      'partially_received',
      'received',
      'cancelled'
    );
  end if;
end
$$;

create table if not exists public.purchase_suppliers (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,

  name text not null,
  tax_id text,
  email text,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, clinic_id)
);

create unique index if not exists purchase_suppliers_clinic_tax_id_idx
  on public.purchase_suppliers (clinic_id, lower(tax_id))
  where tax_id is not null;

create index if not exists purchase_suppliers_list_idx
  on public.purchase_suppliers (clinic_id, is_active, name);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  supplier_id uuid not null,

  status public.purchase_order_status not null default 'draft',
  expected_delivery_date date,
  total_cents integer not null default 0 check (total_cents >= 0),
  notes text,
  created_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (id, clinic_id),
  foreign key (supplier_id, clinic_id)
    references public.purchase_suppliers(id, clinic_id)
    on delete restrict
);

create index if not exists purchase_orders_list_idx
  on public.purchase_orders (clinic_id, status, created_at desc);

create index if not exists purchase_orders_supplier_idx
  on public.purchase_orders (clinic_id, supplier_id, created_at desc);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  purchase_order_id uuid not null,
  inventory_item_id uuid not null,

  quantity integer not null check (quantity > 0),
  unit_cost_cents integer not null check (unit_cost_cents >= 0),
  received_quantity integer not null default 0 check (received_quantity >= 0),
  created_at timestamptz not null default now(),

  unique (id, clinic_id),
  unique (purchase_order_id, inventory_item_id),
  check (received_quantity <= quantity),
  foreign key (purchase_order_id, clinic_id)
    references public.purchase_orders(id, clinic_id)
    on delete cascade,
  foreign key (inventory_item_id, clinic_id)
    references public.inventory_items(id, clinic_id)
    on delete restrict
);

create index if not exists purchase_order_items_order_idx
  on public.purchase_order_items (clinic_id, purchase_order_id);

create index if not exists purchase_order_items_inventory_idx
  on public.purchase_order_items (clinic_id, inventory_item_id);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.purchase_suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

drop policy if exists "purchase_suppliers_select" on public.purchase_suppliers;
create policy "purchase_suppliers_select"
  on public.purchase_suppliers
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'finance']::membership_role[]
    ));

drop policy if exists "purchase_suppliers_insert" on public.purchase_suppliers;
create policy "purchase_suppliers_insert"
  on public.purchase_suppliers
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(array['owner', 'admin']::membership_role[]));

drop policy if exists "purchase_suppliers_update" on public.purchase_suppliers;
create policy "purchase_suppliers_update"
  on public.purchase_suppliers
  for update
  to authenticated
  using (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(array['owner', 'admin']::membership_role[]))
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(array['owner', 'admin']::membership_role[]));

drop policy if exists "purchase_orders_select" on public.purchase_orders;
create policy "purchase_orders_select"
  on public.purchase_orders
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'finance']::membership_role[]
    ));

drop policy if exists "purchase_orders_insert" on public.purchase_orders;
create policy "purchase_orders_insert"
  on public.purchase_orders
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'finance']::membership_role[]
    ));

drop policy if exists "purchase_orders_update" on public.purchase_orders;
create policy "purchase_orders_update"
  on public.purchase_orders
  for update
  to authenticated
  using (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'finance']::membership_role[]
    ))
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'finance']::membership_role[]
    ));

drop policy if exists "purchase_order_items_select" on public.purchase_order_items;
create policy "purchase_order_items_select"
  on public.purchase_order_items
  for select
  to authenticated
  using (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'finance']::membership_role[]
    ));

drop policy if exists "purchase_order_items_insert" on public.purchase_order_items;
create policy "purchase_order_items_insert"
  on public.purchase_order_items
  for insert
  to authenticated
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'finance']::membership_role[]
    ));

drop policy if exists "purchase_order_items_update" on public.purchase_order_items;
create policy "purchase_order_items_update"
  on public.purchase_order_items
  for update
  to authenticated
  using (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'finance']::membership_role[]
    ))
  with check (clinic_id = public.current_clinic_id()
    and public.has_clinic_role(
      array['owner', 'admin', 'finance']::membership_role[]
    ));

-- -----------------------------------------------------------------------------
-- RPCs atômicas
-- -----------------------------------------------------------------------------

create or replace function public.create_purchase_order(
  p_clinic_id uuid,
  p_supplier_id uuid,
  p_expected_delivery_date date,
  p_notes text,
  p_created_by uuid,
  p_items jsonb
)
returns public.purchase_orders
language plpgsql
as $$
declare
  v_order public.purchase_orders;
  v_item jsonb;
  v_inventory_item_id uuid;
  v_quantity integer;
  v_unit_cost_cents integer;
  v_total integer := 0;
  v_count integer := 0;
begin
  if public.current_clinic_id() is distinct from p_clinic_id then
    raise exception 'clinic_scope' using errcode = '42501';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'purchase_order_without_items' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.purchase_suppliers
    where id = p_supplier_id and clinic_id = p_clinic_id and is_active
  ) then
    raise exception 'supplier_not_found' using errcode = 'P0002';
  end if;

  insert into public.purchase_orders (
    clinic_id,
    supplier_id,
    expected_delivery_date,
    notes,
    created_by
  ) values (
    p_clinic_id,
    p_supplier_id,
    p_expected_delivery_date,
    nullif(trim(p_notes), ''),
    p_created_by
  ) returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_inventory_item_id := (v_item ->> 'inventory_item_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;
    v_unit_cost_cents := (v_item ->> 'unit_cost_cents')::integer;

    if v_quantity is null or v_quantity <= 0 or v_unit_cost_cents is null or v_unit_cost_cents < 0 then
      raise exception 'purchase_order_item_invalid' using errcode = '22023';
    end if;

    if not exists (
      select 1 from public.inventory_items
      where id = v_inventory_item_id and clinic_id = p_clinic_id and is_active
    ) then
      raise exception 'inventory_item_not_found' using errcode = 'P0002';
    end if;

    insert into public.purchase_order_items (
      clinic_id,
      purchase_order_id,
      inventory_item_id,
      quantity,
      unit_cost_cents
    ) values (
      p_clinic_id,
      v_order.id,
      v_inventory_item_id,
      v_quantity,
      v_unit_cost_cents
    );

    v_total := v_total + (v_quantity * v_unit_cost_cents);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception 'purchase_order_without_items' using errcode = '22023';
  end if;

  update public.purchase_orders
  set total_cents = v_total,
      updated_at = now()
  where id = v_order.id and clinic_id = p_clinic_id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.transition_purchase_order_status(
  p_clinic_id uuid,
  p_order_id uuid,
  p_status text,
  p_changed_by uuid
)
returns public.purchase_orders
language plpgsql
as $$
declare
  v_order public.purchase_orders;
  v_has_items boolean;
  v_next public.purchase_order_status;
begin
  if public.current_clinic_id() is distinct from p_clinic_id then
    raise exception 'clinic_scope' using errcode = '42501';
  end if;

  begin
    v_next := p_status::public.purchase_order_status;
  exception when invalid_text_representation then
    raise exception 'purchase_order_status_invalid' using errcode = '22023';
  end;

  select * into v_order
  from public.purchase_orders
  where id = p_order_id and clinic_id = p_clinic_id
  for update;

  if not found then
    raise exception 'purchase_order_not_found' using errcode = 'P0002';
  end if;

  if v_order.status = v_next then
    return v_order;
  end if;

  select exists (
    select 1 from public.purchase_order_items
    where purchase_order_id = p_order_id and clinic_id = p_clinic_id
  ) into v_has_items;

  if not v_has_items and v_next in ('requested', 'approved', 'ordered') then
    raise exception 'purchase_order_without_items' using errcode = '22023';
  end if;

  if not (
    (v_order.status = 'draft' and v_next in ('requested', 'cancelled')) or
    (v_order.status = 'requested' and v_next in ('draft', 'approved', 'cancelled')) or
    (v_order.status = 'approved' and v_next in ('requested', 'ordered', 'cancelled')) or
    (v_order.status = 'ordered' and v_next = 'cancelled')
  ) then
    raise exception 'purchase_order_transition_invalid' using errcode = '22023';
  end if;

  update public.purchase_orders
  set status = v_next,
      approved_by = case when v_next = 'approved' then p_changed_by else approved_by end,
      updated_at = now()
  where id = p_order_id and clinic_id = p_clinic_id
  returning * into v_order;

  return v_order;
end;
$$;

create or replace function public.receive_purchase_order_item(
  p_clinic_id uuid,
  p_order_item_id uuid,
  p_quantity integer,
  p_received_by uuid
)
returns public.purchase_order_items
language plpgsql
as $$
declare
  v_line public.purchase_order_items;
  v_order public.purchase_orders;
  v_inventory public.inventory_items;
  v_total_quantity integer;
  v_received_quantity integer;
  v_next_status public.purchase_order_status;
begin
  if public.current_clinic_id() is distinct from p_clinic_id then
    raise exception 'clinic_scope' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'received_quantity_invalid' using errcode = '22023';
  end if;

  select * into v_line
  from public.purchase_order_items
  where id = p_order_item_id and clinic_id = p_clinic_id
  for update;

  if not found then
    raise exception 'purchase_order_item_not_found' using errcode = 'P0002';
  end if;

  select * into v_order
  from public.purchase_orders
  where id = v_line.purchase_order_id and clinic_id = p_clinic_id
  for update;

  if v_order.status not in ('ordered', 'partially_received') then
    raise exception 'purchase_order_not_ready_to_receive' using errcode = '22023';
  end if;

  if p_quantity > (v_line.quantity - v_line.received_quantity) then
    raise exception 'received_quantity_exceeds_order' using errcode = '22023';
  end if;

  select * into v_inventory
  from public.inventory_items
  where id = v_line.inventory_item_id and clinic_id = p_clinic_id and is_active
  for update;

  if not found then
    raise exception 'inventory_item_not_found' using errcode = 'P0002';
  end if;

  update public.inventory_items
  set current_quantity = current_quantity + p_quantity,
      updated_at = now()
  where id = v_inventory.id and clinic_id = p_clinic_id;

  insert into public.inventory_movements (
    clinic_id,
    item_id,
    movement_type,
    quantity,
    unit_cost_cents,
    reason,
    created_by
  ) values (
    p_clinic_id,
    v_inventory.id,
    'in',
    p_quantity,
    v_line.unit_cost_cents,
    'Recebimento de pedido ' || left(v_order.id::text, 8),
    p_received_by
  );

  update public.purchase_order_items
  set received_quantity = received_quantity + p_quantity
  where id = v_line.id and clinic_id = p_clinic_id
  returning * into v_line;

  select sum(quantity), sum(received_quantity)
    into v_total_quantity, v_received_quantity
  from public.purchase_order_items
  where purchase_order_id = v_order.id and clinic_id = p_clinic_id;

  v_next_status := case
    when v_received_quantity >= v_total_quantity then 'received'::public.purchase_order_status
    else 'partially_received'::public.purchase_order_status
  end;

  update public.purchase_orders
  set status = v_next_status,
      updated_at = now()
  where id = v_order.id and clinic_id = p_clinic_id;

  return v_line;
end;
$$;

revoke all on function public.create_purchase_order(uuid, uuid, date, text, uuid, jsonb) from public;
grant execute on function public.create_purchase_order(uuid, uuid, date, text, uuid, jsonb) to authenticated;

revoke all on function public.transition_purchase_order_status(uuid, uuid, text, uuid) from public;
grant execute on function public.transition_purchase_order_status(uuid, uuid, text, uuid) to authenticated;

revoke all on function public.receive_purchase_order_item(uuid, uuid, integer, uuid) from public;
grant execute on function public.receive_purchase_order_item(uuid, uuid, integer, uuid) to authenticated;

commit;

-- Verificar depois de aplicar:
-- select relrowsecurity from pg_class
--   where relname in ('purchase_suppliers', 'purchase_orders', 'purchase_order_items');
-- select policyname, tablename, cmd from pg_policies
--   where tablename in ('purchase_suppliers', 'purchase_orders', 'purchase_order_items');
-- Testar com duas clínicas: a clínica B não deve ler nem inserir em A.
-- Criar pedido com duas linhas; avançar até ordered; receber em duas operações;
-- conferir que inventory_items.current_quantity e inventory_movements mudaram
-- na mesma transação e que a ordem terminou como received.
-- Depois: npm run db:types
