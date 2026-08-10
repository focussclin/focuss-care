import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type {
  InventoryItem,
  InventoryItemUpdateData,
  InventoryMovement,
  NewInventoryItemData,
  NewInventoryMovementData,
} from '../domain/Inventory'
import type { InventoryRepository } from '../domain/InventoryRepository'
import { InventoryRepositoryError } from '../domain/InventoryRepositoryError'
import {
  asInventoryClient,
  type InventoryClient,
  type InventoryItemRow,
  type InventoryMovementRow,
  type InventoryQueryError,
  type InventoryItemUpdate,
} from './inventoryDatabase'

const ITEM_SELECT = `
  id,
  clinic_id,
  name,
  sku,
  unit,
  minimum_quantity,
  current_quantity,
  notes,
  is_active,
  created_by,
  created_at,
  updated_at
`

const MOVEMENT_SELECT = `
  id,
  clinic_id,
  item_id,
  movement_type,
  quantity,
  unit_cost_cents,
  reason,
  created_by,
  created_at
`

const ITEM_ROW_CAP = 200
const MOVEMENT_ROW_CAP = 100

function toItem(row: InventoryItemRow): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    unit: row.unit,
    minimumQuantity: row.minimum_quantity,
    currentQuantity: row.current_quantity,
    notes: row.notes,
    isActive: row.is_active,
    updatedAt: new Date(row.updated_at),
  }
}

function toMovement(row: InventoryMovementRow): InventoryMovement {
  return {
    id: row.id,
    itemId: row.item_id,
    movementType: row.movement_type,
    quantity: row.quantity,
    unitCostCents: row.unit_cost_cents,
    reason: row.reason,
    createdAt: new Date(row.created_at),
  }
}

export class SupabaseInventoryRepository implements InventoryRepository {
  private readonly client: InventoryClient

  constructor(client: SupabaseClient<Database>) {
    this.client = asInventoryClient(client)
  }

  async listItems(clinicId: string): Promise<InventoryItem[]> {
    const { data, error } = await this.client
      .from('inventory_items')
      .select(ITEM_SELECT)
      .eq('clinic_id', clinicId)
      .order('name', { ascending: true })
      .limit(ITEM_ROW_CAP)

    if (error) throw toInventoryError(error)
    return (data ?? []).map((row) => toItem(row as unknown as InventoryItemRow))
  }

  async listRecentMovements(clinicId: string): Promise<InventoryMovement[]> {
    const { data, error } = await this.client
      .from('inventory_movements')
      .select(MOVEMENT_SELECT)
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(MOVEMENT_ROW_CAP)

    if (error) throw toInventoryError(error)
    return (data ?? []).map((row) => toMovement(row as unknown as InventoryMovementRow))
  }

  async createItem(
    clinicId: string,
    createdBy: string,
    data: NewInventoryItemData,
  ): Promise<InventoryItem> {
    const { data: row, error } = await this.client
      .from('inventory_items')
      .insert({
        clinic_id: clinicId,
        name: data.name,
        sku: data.sku,
        unit: data.unit,
        minimum_quantity: data.minimumQuantity,
        notes: data.notes,
        created_by: createdBy,
      })
      .select(ITEM_SELECT)
      .single()

    if (error) throw toInventoryError(error)
    if (!row) throw notFound()
    return toItem(row as unknown as InventoryItemRow)
  }

  async updateItem(
    clinicId: string,
    itemId: string,
    data: InventoryItemUpdateData,
  ): Promise<InventoryItem> {
    const patch: InventoryItemUpdate = {
      updated_at: new Date().toISOString(),
    }
    if (data.name !== undefined) patch.name = data.name
    if (data.sku !== undefined) patch.sku = data.sku
    if (data.unit !== undefined) patch.unit = data.unit
    if (data.minimumQuantity !== undefined) patch.minimum_quantity = data.minimumQuantity
    if (data.notes !== undefined) patch.notes = data.notes
    if (data.isActive !== undefined) patch.is_active = data.isActive

    const { data: row, error } = await this.client
      .from('inventory_items')
      .update(patch)
      .eq('clinic_id', clinicId)
      .eq('id', itemId)
      .select(ITEM_SELECT)
      .maybeSingle()

    if (error) throw toInventoryError(error)
    if (!row) throw notFound()
    return toItem(row as unknown as InventoryItemRow)
  }

  async setItemActive(
    clinicId: string,
    itemId: string,
    isActive: boolean,
  ): Promise<InventoryItem> {
    return this.updateItem(clinicId, itemId, { isActive })
  }

  async recordMovement(
    clinicId: string,
    data: NewInventoryMovementData,
  ): Promise<InventoryMovement> {
    const { data: row, error } = await this.client.rpc('record_inventory_movement', {
      p_clinic_id: clinicId,
      p_item_id: data.itemId,
      p_movement_type: data.movementType,
      p_quantity: data.quantity,
      p_unit_cost_cents: data.unitCostCents,
      p_reason: data.reason,
    })

    if (error) throw toInventoryError(error)
    if (!row) throw notFound()
    return toMovement(row as unknown as InventoryMovementRow)
  }
}

function notFound(): InventoryRepositoryError {
  return new InventoryRepositoryError('not-found', 'item indisponível')
}

function toInventoryError(error: InventoryQueryError): InventoryRepositoryError {
  const code = error.code ?? undefined
  const message = error.message?.toLowerCase() ?? ''

  if (code === '42P01' || code === 'PGRST205') {
    return new InventoryRepositoryError('schema-not-ready', 'inventory ausente', code)
  }
  if (code === '42501' || message.includes('clinic_scope')) {
    return new InventoryRepositoryError('forbidden', 'recusado pela policy', code)
  }
  if (code === '23505') {
    return new InventoryRepositoryError('duplicate', 'sku duplicado', code)
  }
  if (code === 'P0001' || message.includes('insufficient_stock')) {
    return new InventoryRepositoryError('insufficient-stock', 'saldo insuficiente', code)
  }
  if (code === '22023' || message.includes('invalid_movement')) {
    return new InventoryRepositoryError('invalid-movement', 'movimentação inválida', code)
  }
  if (code === 'P0002') return notFound()
  if (code === 'PGRST301' || code === 'PGRST000' || message.includes('fetch')) {
    return new InventoryRepositoryError('unavailable', 'serviço indisponível', code)
  }
  return new InventoryRepositoryError('unexpected', 'falha ao acessar estoque', code)
}
