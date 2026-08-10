export const INVENTORY_MOVEMENT_TYPES = ['in', 'out'] as const
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number]

export interface InventoryItem {
  id: string
  name: string
  sku: string | null
  unit: string
  minimumQuantity: number
  currentQuantity: number
  notes: string | null
  isActive: boolean
  updatedAt: Date
}

export interface InventoryMovement {
  id: string
  itemId: string
  movementType: InventoryMovementType
  quantity: number
  unitCostCents: number | null
  reason: string | null
  createdAt: Date
}

export interface NewInventoryItemData {
  name: string
  sku: string | null
  unit: string
  minimumQuantity: number
  notes: string | null
}

export type InventoryItemUpdateData = Partial<NewInventoryItemData> & {
  isActive?: boolean
}

export interface NewInventoryMovementData {
  itemId: string
  movementType: InventoryMovementType
  quantity: number
  unitCostCents: number | null
  reason: string | null
}
