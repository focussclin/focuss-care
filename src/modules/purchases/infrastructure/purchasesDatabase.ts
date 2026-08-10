import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { PurchaseOrderStatus } from '../domain/Purchase'

/** Tipos locais enquanto `20260809_purchases.sql` não foi aplicada. */
export interface PurchaseSupplierRow {
  id: string
  clinic_id: string
  name: string
  tax_id: string | null
  email: string | null
  phone: string | null
  notes: string | null
  is_active: boolean
  updated_at: string
}

export interface PurchaseCatalogRow {
  id: string
  name: string
  unit: string
  current_quantity: number
}

export interface PurchaseOrderItemRow {
  id: string
  clinic_id: string
  inventory_item_id: string
  quantity: number
  unit_cost_cents: number
  received_quantity: number
  inventory: { id: string; name: string; unit: string } | null
}

export interface PurchaseOrderRow {
  id: string
  clinic_id: string
  supplier_id: string
  status: PurchaseOrderStatus
  expected_delivery_date: string | null
  total_cents: number
  notes: string | null
  created_at: string
  updated_at: string
  supplier: { id: string; name: string } | null
  items: readonly PurchaseOrderItemRow[]
}

export interface PurchaseSupplierInsert {
  clinic_id: string
  name: string
  tax_id: string | null
  email: string | null
  phone: string | null
  notes: string | null
  created_by: string
}

export interface PurchaseSupplierUpdate {
  name?: string
  tax_id?: string | null
  email?: string | null
  phone?: string | null
  notes?: string | null
  is_active?: boolean
  updated_at?: string
}

export interface PurchaseQueryError {
  code?: string | null
  message?: string | null
}

export interface PurchaseQueryResponse<T> {
  data: T
  error: PurchaseQueryError | null
}

export interface SupplierQueryBuilder
  extends PromiseLike<PurchaseQueryResponse<readonly PurchaseSupplierRow[] | null>> {
  eq(column: string, value: string | boolean): SupplierQueryBuilder
  order(column: string, options: { ascending: boolean }): SupplierQueryBuilder
  limit(count: number): SupplierQueryBuilder
  select(columns: string): SupplierQueryBuilder
  insert(values: PurchaseSupplierInsert): SupplierQueryBuilder
  update(values: PurchaseSupplierUpdate): SupplierQueryBuilder
  single(): PromiseLike<PurchaseQueryResponse<PurchaseSupplierRow | null>>
  maybeSingle(): PromiseLike<PurchaseQueryResponse<PurchaseSupplierRow | null>>
}

export interface CatalogQueryBuilder
  extends PromiseLike<PurchaseQueryResponse<readonly PurchaseCatalogRow[] | null>> {
  eq(column: string, value: string | boolean): CatalogQueryBuilder
  order(column: string, options: { ascending: boolean }): CatalogQueryBuilder
  limit(count: number): CatalogQueryBuilder
  select(columns: string): CatalogQueryBuilder
}

export interface OrderQueryBuilder
  extends PromiseLike<PurchaseQueryResponse<readonly PurchaseOrderRow[] | null>> {
  eq(column: string, value: string): OrderQueryBuilder
  order(column: string, options: { ascending: boolean }): OrderQueryBuilder
  limit(count: number): OrderQueryBuilder
  select(columns: string): OrderQueryBuilder
}

export interface PurchaseRpcArgs {
  p_clinic_id: string
  p_supplier_id?: string
  p_expected_delivery_date?: string | null
  p_notes?: string | null
  p_created_by?: string
  p_items?: readonly {
    inventory_item_id: string
    quantity: number
    unit_cost_cents: number
  }[]
  p_order_id?: string
  p_status?: string
  p_changed_by?: string
  p_order_item_id?: string
  p_quantity?: number
  p_received_by?: string
}

export interface PurchasesClient {
  from(relation: 'purchase_suppliers'): SupplierQueryBuilder
  from(relation: 'inventory_items'): CatalogQueryBuilder
  from(relation: 'purchase_orders'): OrderQueryBuilder
  rpc(
    fn: 'create_purchase_order',
    args: PurchaseRpcArgs,
  ): PromiseLike<PurchaseQueryResponse<PurchaseOrderRow | null>>
  rpc(
    fn: 'transition_purchase_order_status',
    args: PurchaseRpcArgs,
  ): PromiseLike<PurchaseQueryResponse<PurchaseOrderRow | null>>
  rpc(
    fn: 'receive_purchase_order_item',
    args: PurchaseRpcArgs,
  ): PromiseLike<PurchaseQueryResponse<PurchaseOrderItemRow | null>>
}

export function asPurchasesClient(client: SupabaseClient<Database>): PurchasesClient {
  return client as unknown as PurchasesClient
}
