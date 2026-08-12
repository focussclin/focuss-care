-- =============================================================================
-- Estoque da clínica: itens, saldo e movimentações auditáveis
-- =============================================================================
--
-- NAO APLICADA. Revisar no Supabase antes de executar.
--
-- O saldo é mantido com lock de linha dentro da função de movimentação. Assim a
-- aplicação não faz o perigoso fluxo "ler saldo -> calcular -> gravar" em duas
-- requests concorrentes.
-- =============================================================================

begin;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  sku text,
  unit text not null default 'unidade',
  minimum_quantity integer not null default 0 check (minimum_quantity >= 0),
  current_quantity integer not null default 0 check (current_quantity >= 0),
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, clinic_id)
);

create unique index if not exists inventory_items_clinic_sku_idx
  on public.inventory_items (clinic_id, lower(sku))
  where sku is not null;

create index if not exists inventory_items_list_idx
  on public.inventory_items (clinic_id, is_active, name);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  item_id uuid not null,
  movement_type text not null check (movement_type in ('in', 'out')),
  quantity integer not null check (quantity > 0),
  unit_cost_cents integer check (unit_cost_cents is null or unit_cost_cents >= 0),
  -- Preenchido SO pela contagem de inventario (`set_inventory_quantity`), com o
  -- que foi contado na prateleira.
  --
  -- O ajuste continua sendo uma entrada ou uma saida — a direcao do saldo nao
  -- pode depender de um terceiro `movement_type`, senao a soma do extrato
  -- precisaria de um `case` a mais em todo lugar que le. O que muda e a CAUSA:
  -- sem esta coluna, "saida de 3, motivo: contagem" e "saida de 3, motivo:
  -- consumo" ficam indistinguiveis a nao ser por texto livre, e a clinica nunca
  -- consegue responder quanto perdeu por quebra/vencimento.
  counted_quantity integer
    check (counted_quantity is null or counted_quantity >= 0),
  reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (item_id, clinic_id)
    references public.inventory_items(id, clinic_id)
    on delete restrict
);

create index if not exists inventory_movements_timeline_idx
  on public.inventory_movements (clinic_id, created_at desc);

create index if not exists inventory_movements_item_idx
  on public.inventory_movements (clinic_id, item_id, created_at desc);

alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;

-- O PAPEL entra na policy, e nao so o tenant.
--
-- `clinic_id = current_clinic_id()` sozinho isola a clinica e mais nada. O
-- navegador tem a chave publicavel e o proprio JWT do membro, entao ele alcanca
-- o PostgREST direto — e ali nao existe `roles:` de action nenhuma. Sem o
-- predicado abaixo, a separacao por papel viveria SO na aplicacao, que e
-- exatamente o contrario do que `src/lib/auth/permissions.ts` declara ("se esta
-- matriz e a RLS discordarem, a RLS esta certa").
--
-- As listas espelham as actions, uma a uma:
--   leitura  -> `invoice.read`    (a rota `/estoque`)
--   cadastro -> `clinic.settings` (create/update/toggle Item)
--   movimento-> `invoice.write`   (`record_inventory_movement`)
--
-- Mesmo padrao ja usado em `20260809_rooms.sql`.

drop policy if exists "inventory_items_select" on public.inventory_items;
create policy "inventory_items_select"
  on public.inventory_items
  for select
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and public.has_clinic_role(variadic array['owner', 'admin', 'finance']::membership_role[])
  );

drop policy if exists "inventory_items_insert" on public.inventory_items;
create policy "inventory_items_insert"
  on public.inventory_items
  for insert
  to authenticated
  with check (
    clinic_id = public.current_clinic_id()
    and public.has_clinic_role(variadic array['owner', 'admin']::membership_role[])
  );

drop policy if exists "inventory_items_update" on public.inventory_items;
create policy "inventory_items_update"
  on public.inventory_items
  for update
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and public.has_clinic_role(variadic array['owner', 'admin']::membership_role[])
  )
  with check (
    clinic_id = public.current_clinic_id()
    and public.has_clinic_role(variadic array['owner', 'admin']::membership_role[])
  );

drop policy if exists "inventory_movements_select" on public.inventory_movements;
create policy "inventory_movements_select"
  on public.inventory_movements
  for select
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    and public.has_clinic_role(variadic array['owner', 'admin', 'finance']::membership_role[])
  );

-- A escrita direta existe so como rede: o caminho da aplicacao e a RPC
-- `record_inventory_movement`, que grava saldo e movimento na mesma transacao.
drop policy if exists "inventory_movements_insert" on public.inventory_movements;
create policy "inventory_movements_insert"
  on public.inventory_movements
  for insert
  to authenticated
  with check (
    clinic_id = public.current_clinic_id()
    and public.has_clinic_role(variadic array['owner', 'admin', 'finance']::membership_role[])
  );

create or replace function public.record_inventory_movement(
  p_clinic_id uuid,
  p_item_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_unit_cost_cents integer,
  p_reason text
)
returns public.inventory_movements
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.inventory_items;
  v_movement public.inventory_movements;
begin
  if p_clinic_id is distinct from public.current_clinic_id() then
    raise exception 'CLINIC_SCOPE' using errcode = '42501';
  end if;

  if p_movement_type not in ('in', 'out') or p_quantity is null or p_quantity <= 0 then
    raise exception 'INVALID_MOVEMENT' using errcode = '22023';
  end if;

  select * into v_item
    from public.inventory_items
   where id = p_item_id
     and clinic_id = p_clinic_id
     and is_active = true
   for update;

  if not found then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_movement_type = 'out' and v_item.current_quantity < p_quantity then
    raise exception 'INSUFFICIENT_STOCK' using errcode = 'P0001';
  end if;

  update public.inventory_items
     set current_quantity = case
       when p_movement_type = 'in' then current_quantity + p_quantity
       else current_quantity - p_quantity
     end,
         updated_at = now()
   where id = p_item_id
     and clinic_id = p_clinic_id;

  insert into public.inventory_movements (
    clinic_id, item_id, movement_type, quantity, unit_cost_cents, reason, created_by
  ) values (
    p_clinic_id, p_item_id, p_movement_type, p_quantity, p_unit_cost_cents,
    nullif(trim(p_reason), ''), auth.uid()
  ) returning * into v_movement;

  return v_movement;
end;
$$;

revoke all on function public.record_inventory_movement(uuid, uuid, text, integer, integer, text) from public;
grant execute on function public.record_inventory_movement(uuid, uuid, text, integer, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Ajuste por contagem de inventario
-- ---------------------------------------------------------------------------
--
-- Recebe o que foi CONTADO na prateleira, nao a diferenca. A subtracao acontece
-- aqui dentro, depois do `for update`.
--
-- Essa distincao e a razao de a funcao existir. Calcular `contado - saldo` na
-- aplicacao obriga a ler o saldo antes, e entre a leitura e a gravacao qualquer
-- saida registrada por outra pessoa se perde: as duas contagens partem do mesmo
-- saldo velho e a ultima sobrescreve a primeira. E exatamente o fluxo "ler ->
-- calcular -> gravar" que o cabecalho deste arquivo diz que nao pode existir.
--
-- Contagem igual ao saldo devolve NULL. Nao e erro — e o resultado normal de
-- conferir um item que esta certo, e gravar um movimento de zero unidades
-- (proibido por `quantity > 0`) so sujaria o extrato.
create or replace function public.set_inventory_quantity(
  p_clinic_id uuid,
  p_item_id uuid,
  p_counted_quantity integer,
  p_reason text
)
returns public.inventory_movements
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item public.inventory_items;
  v_delta integer;
  v_movement public.inventory_movements;
begin
  if p_clinic_id is distinct from public.current_clinic_id() then
    raise exception 'CLINIC_SCOPE' using errcode = '42501';
  end if;

  if p_counted_quantity is null or p_counted_quantity < 0 then
    raise exception 'INVALID_MOVEMENT' using errcode = '22023';
  end if;

  select * into v_item
    from public.inventory_items
   where id = p_item_id
     and clinic_id = p_clinic_id
     and is_active = true
   for update;

  if not found then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_delta := p_counted_quantity - v_item.current_quantity;

  if v_delta = 0 then
    return null;
  end if;

  update public.inventory_items
     set current_quantity = p_counted_quantity,
         updated_at = now()
   where id = p_item_id
     and clinic_id = p_clinic_id;

  insert into public.inventory_movements (
    clinic_id, item_id, movement_type, quantity, unit_cost_cents,
    counted_quantity, reason, created_by
  ) values (
    p_clinic_id,
    p_item_id,
    case when v_delta > 0 then 'in' else 'out' end,
    abs(v_delta),
    null,
    p_counted_quantity,
    nullif(trim(p_reason), ''),
    auth.uid()
  ) returning * into v_movement;

  return v_movement;
end;
$$;

revoke all on function public.set_inventory_quantity(uuid, uuid, integer, text) from public;
grant execute on function public.set_inventory_quantity(uuid, uuid, integer, text) to authenticated;

commit;

-- Verificar depois de aplicar:
-- select relrowsecurity from pg_class
--   where relname in ('inventory_items', 'inventory_movements');
-- select policyname, tablename, cmd from pg_policies
--   where tablename in ('inventory_items', 'inventory_movements');
-- Testar com duas clinicas e concorrencia de saidas do mesmo item.
-- Depois: npm run db:types
