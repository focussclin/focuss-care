import type {
  InventoryItem,
  InventoryItemUpdateData,
  InventoryMovement,
  NewInventoryItemData,
  NewInventoryMovementData,
} from './Inventory'

export interface InventoryRepository {
  listItems(clinicId: string): Promise<InventoryItem[]>
  listRecentMovements(clinicId: string): Promise<InventoryMovement[]>
  createItem(
    clinicId: string,
    createdBy: string,
    data: NewInventoryItemData,
  ): Promise<InventoryItem>
  updateItem(
    clinicId: string,
    itemId: string,
    data: InventoryItemUpdateData,
  ): Promise<InventoryItem>
  setItemActive(
    clinicId: string,
    itemId: string,
    isActive: boolean,
  ): Promise<InventoryItem>
  recordMovement(
    clinicId: string,
    createdBy: string,
    data: NewInventoryMovementData,
  ): Promise<InventoryMovement>
}
