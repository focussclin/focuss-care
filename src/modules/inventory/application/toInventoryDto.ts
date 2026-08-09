import type { InventoryItem, InventoryMovement } from '../domain/Inventory'
import type { InventoryItemDto, InventoryMovementDto } from '../schemas/inventory.schema'

export function toInventoryItemDto(item: InventoryItem): InventoryItemDto {
  return {
    id: item.id,
    name: item.name,
    sku: item.sku,
    unit: item.unit,
    minimumQuantity: item.minimumQuantity,
    currentQuantity: item.currentQuantity,
    notes: item.notes,
    isActive: item.isActive,
    updatedAt: item.updatedAt.toISOString(),
  }
}

export function toInventoryMovementDto(
  movement: InventoryMovement,
): InventoryMovementDto {
  return {
    id: movement.id,
    itemId: movement.itemId,
    movementType: movement.movementType,
    quantity: movement.quantity,
    unitCostCents: movement.unitCostCents,
    reason: movement.reason,
    createdAt: movement.createdAt.toISOString(),
  }
}
