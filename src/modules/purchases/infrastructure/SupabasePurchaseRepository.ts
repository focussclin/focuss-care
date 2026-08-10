import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type {
  NewPurchaseOrderData,
  NewPurchaseSupplierData,
  PurchaseCatalogItem,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  PurchaseSupplier,
  PurchaseSupplierUpdateData,
} from '../domain/Purchase'
import type { PurchaseRepository } from '../domain/PurchaseRepository'
import { PurchaseRepositoryError } from '../domain/PurchaseRepositoryError'
import {
  asPurchasesClient,
  type PurchaseCatalogRow,
  type PurchaseOrderItemRow,
  type PurchaseOrderRow,
  type PurchaseQueryError,
  type PurchaseSupplierRow,
  type PurchaseSupplierUpdate,
  type PurchasesClient,
} from './purchasesDatabase'

const SUPPLIER_SELECT = `
  id,
  clinic_id,
  name,
  tax_id,
  email,
  phone,
  notes,
  is_active,
  updated_at
`

const CATALOG_SELECT = 'id, name, unit, current_quantity'

const ORDER_SELECT = `
  id,
  clinic_id,
  supplier_id,
  status,
  expected_delivery_date,
  total_cents,
  notes,
  created_at,
  updated_at,
  supplier:purchase_suppliers ( id, name ),
  items:purchase_order_items (
    id,
    clinic_id,
    inventory_item_id,
    quantity,
    unit_cost_cents,
    received_quantity,
    inventory:inventory_items ( id, name, unit )
  )
`

const SUPPLIER_ROW_CAP = 300
const CATALOG_ROW_CAP = 500
const ORDER_ROW_CAP = 200

export class SupabasePurchaseRepository implements PurchaseRepository {
  private readonly client: PurchasesClient

  constructor(client: SupabaseClient<Database>) {
    this.client = asPurchasesClient(client)
  }

  async listSuppliers(clinicId: string): Promise<PurchaseSupplier[]> {
    const { data, error } = await this.client
      .from('purchase_suppliers')
      .select(SUPPLIER_SELECT)
      .eq('clinic_id', clinicId)
      .order('is_active', { ascending: false })
      .order('name', { ascending: true })
      .limit(SUPPLIER_ROW_CAP)

    if (error) throw toPurchaseError(error)
    return (data ?? []).map((row) => toSupplier(row as unknown as PurchaseSupplierRow))
  }

  async listCatalog(clinicId: string): Promise<PurchaseCatalogItem[]> {
    const { data, error } = await this.client
      .from('inventory_items')
      .select(CATALOG_SELECT)
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(CATALOG_ROW_CAP)

    if (error) throw toPurchaseError(error)
    return (data ?? []).map((row) => toCatalogItem(row as unknown as PurchaseCatalogRow))
  }

  async listOrders(clinicId: string): Promise<PurchaseOrder[]> {
    const { data, error } = await this.client
      .from('purchase_orders')
      .select(ORDER_SELECT)
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(ORDER_ROW_CAP)

    if (error) throw toPurchaseError(error)
    return (data ?? []).map((row) => toOrder(row as unknown as PurchaseOrderRow))
  }

  async createSupplier(
    clinicId: string,
    createdBy: string,
    data: NewPurchaseSupplierData,
  ): Promise<PurchaseSupplier> {
    const { data: row, error } = await this.client
      .from('purchase_suppliers')
      .insert({
        clinic_id: clinicId,
        name: data.name,
        tax_id: data.taxId,
        email: data.email,
        phone: data.phone,
        notes: data.notes,
        created_by: createdBy,
      })
      .select(SUPPLIER_SELECT)
      .single()

    if (error) throw toPurchaseError(error)
    if (!row) throw notFound()
    return toSupplier(row as unknown as PurchaseSupplierRow)
  }

  async updateSupplier(
    clinicId: string,
    supplierId: string,
    data: PurchaseSupplierUpdateData,
  ): Promise<PurchaseSupplier> {
    const patch: PurchaseSupplierUpdate = { updated_at: new Date().toISOString() }
    if (data.name !== undefined) patch.name = data.name
    if (data.taxId !== undefined) patch.tax_id = data.taxId
    if (data.email !== undefined) patch.email = data.email
    if (data.phone !== undefined) patch.phone = data.phone
    if (data.notes !== undefined) patch.notes = data.notes
    if (data.isActive !== undefined) patch.is_active = data.isActive

    const { data: row, error } = await this.client
      .from('purchase_suppliers')
      .update(patch)
      .eq('clinic_id', clinicId)
      .eq('id', supplierId)
      .select(SUPPLIER_SELECT)
      .maybeSingle()

    if (error) throw toPurchaseError(error)
    if (!row) throw notFound()
    return toSupplier(row as unknown as PurchaseSupplierRow)
  }

  async createOrder(
    clinicId: string,
    data: NewPurchaseOrderData,
  ): Promise<PurchaseOrder> {
    const { data: row, error } = await this.client.rpc('create_purchase_order', {
      p_clinic_id: clinicId,
      p_supplier_id: data.supplierId,
      p_expected_delivery_date: data.expectedDeliveryDate
        ? toDateOnly(data.expectedDeliveryDate)
        : null,
      p_notes: data.notes,
      p_items: data.items.map((item) => ({
        inventory_item_id: item.inventoryItemId,
        quantity: item.quantity,
        unit_cost_cents: item.unitCostCents,
      })),
    })

    if (error) throw toPurchaseError(error)
    if (!row) throw notFound()
    return toOrder(row as unknown as PurchaseOrderRow)
  }

  async transitionOrder(
    clinicId: string,
    orderId: string,
    status: PurchaseOrderStatus,
  ): Promise<PurchaseOrder> {
    const { data: row, error } = await this.client.rpc(
      'transition_purchase_order_status',
      {
        p_clinic_id: clinicId,
        p_order_id: orderId,
        p_status: status,
      },
    )

    if (error) throw toPurchaseError(error)
    if (!row) throw notFound()
    return toOrder(row as unknown as PurchaseOrderRow)
  }

  async receiveOrderItem(
    clinicId: string,
    orderItemId: string,
    quantity: number,
  ): Promise<PurchaseOrderItem> {
    const { data: row, error } = await this.client.rpc('receive_purchase_order_item', {
      p_clinic_id: clinicId,
      p_order_item_id: orderItemId,
      p_quantity: quantity,
    })

    if (error) throw toPurchaseError(error)
    if (!row) throw notFound()
    return toOrderItem(row as unknown as PurchaseOrderItemRow)
  }
}

function toSupplier(row: PurchaseSupplierRow): PurchaseSupplier {
  return {
    id: row.id,
    name: row.name,
    taxId: row.tax_id,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    isActive: row.is_active,
    updatedAt: new Date(row.updated_at),
  }
}

function toCatalogItem(row: PurchaseCatalogRow): PurchaseCatalogItem {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    currentQuantity: row.current_quantity,
  }
}

function toOrderItem(row: PurchaseOrderItemRow): PurchaseOrderItem {
  return {
    id: row.id,
    inventoryItemId: row.inventory_item_id,
    inventoryItemName: row.inventory?.name ?? 'Item removido',
    inventoryItemUnit: row.inventory?.unit ?? 'unidade',
    quantity: row.quantity,
    unitCostCents: row.unit_cost_cents,
    receivedQuantity: row.received_quantity,
  }
}

function toOrder(row: PurchaseOrderRow): PurchaseOrder {
  return {
    id: row.id,
    supplier: row.supplier ?? { id: row.supplier_id, name: 'Fornecedor indisponível' },
    status: row.status,
    expectedDeliveryDate: row.expected_delivery_date
      ? new Date(`${row.expected_delivery_date}T12:00:00`)
      : null,
    totalCents: row.total_cents,
    notes: row.notes,
    items: (row.items ?? []).map(toOrderItem),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function notFound(): PurchaseRepositoryError {
  return new PurchaseRepositoryError('not-found', 'compra indisponível')
}

function toPurchaseError(error: PurchaseQueryError): PurchaseRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? ''

  if (code === '42P01' || code === 'PGRST205') {
    return new PurchaseRepositoryError('schema-not-ready', 'compras ausente', code)
  }
  if (code === '42501' || /clinic_scope/i.test(message)) {
    return new PurchaseRepositoryError('forbidden', 'operação recusada pela policy', code)
  }
  if (code === '23505') {
    return new PurchaseRepositoryError('duplicate', 'fornecedor duplicado', code)
  }
  if (code === 'P0002') return notFound()
  if (code === '22023' || /purchase_order|received_quantity|inventory_item/i.test(message)) {
    return new PurchaseRepositoryError('invalid', 'operação de compra inválida', code)
  }
  if (/fetch|network|timeout|econnrefused/i.test(message)) {
    return new PurchaseRepositoryError('unavailable', 'falha de conexão', code)
  }
  return new PurchaseRepositoryError('unexpected', 'falha ao acessar compras', code)
}
