import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { InventoryMovementType } from '../domain/Inventory'

/** Tipos locais enquanto `20260809_inventory.sql` não está aplicada. */
export interface InventoryItemRow {
  id: string
  clinic_id: string
  name: string
  sku: string | null
  unit: string
  minimum_quantity: number
  current_quantity: number
  notes: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface InventoryMovementRow {
  id: string
  clinic_id: string
  item_id: string
  movement_type: InventoryMovementType
  quantity: number
  unit_cost_cents: number | null
  reason: string | null
  created_by: string | null
  created_at: string
}

export interface InventoryItemInsert {
  clinic_id: string
  name: string
  sku: string | null
  unit: string
  minimum_quantity: number
  notes: string | null
  created_by: string
}

export interface InventoryItemUpdate {
  name?: string
  sku?: string | null
  unit?: string
  minimum_quantity?: number
  notes?: string | null
  is_active?: boolean
  updated_at?: string
}

export interface InventoryQueryError {
  code?: string | null
  message?: string | null
}

export interface InventoryQueryResponse<T> {
  data: T
  error: InventoryQueryError | null
}

export interface InventoryItemQueryBuilder
  extends PromiseLike<InventoryQueryResponse<readonly InventoryItemRow[] | null>> {
  eq(column: string, value: string | boolean): InventoryItemQueryBuilder
  order(column: string, options: { ascending: boolean }): InventoryItemQueryBuilder
  limit(count: number): InventoryItemQueryBuilder
  select(columns: string): InventoryItemQueryBuilder
  insert(values: InventoryItemInsert): InventoryItemQueryBuilder
  update(values: InventoryItemUpdate): InventoryItemQueryBuilder
  single(): PromiseLike<InventoryQueryResponse<InventoryItemRow | null>>
  maybeSingle(): PromiseLike<InventoryQueryResponse<InventoryItemRow | null>>
}

export interface InventoryMovementQueryBuilder
  extends PromiseLike<InventoryQueryResponse<readonly InventoryMovementRow[] | null>> {
  eq(column: string, value: string): InventoryMovementQueryBuilder
  order(column: string, options: { ascending: boolean }): InventoryMovementQueryBuilder
  limit(count: number): InventoryMovementQueryBuilder
  select(columns: string): InventoryMovementQueryBuilder
}

export interface InventoryRpcArgs {
  p_clinic_id: string
  p_item_id: string
  p_movement_type: InventoryMovementType
  p_quantity: number
  p_unit_cost_cents: number | null
  p_reason: string | null
  p_created_by: string
}

export interface InventoryClient {
  from(relation: 'inventory_items'): InventoryItemQueryBuilder
  from(relation: 'inventory_movements'): InventoryMovementQueryBuilder
  rpc(
    fn: 'record_inventory_movement',
    args: InventoryRpcArgs,
  ): PromiseLike<InventoryQueryResponse<InventoryMovementRow | null>>
}

export function asInventoryClient(client: SupabaseClient<Database>): InventoryClient {
  return client as unknown as InventoryClient
}
