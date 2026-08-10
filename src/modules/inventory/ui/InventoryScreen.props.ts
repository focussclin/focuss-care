import type {
  InventoryCountFormValues,
  InventoryCountOutcome,
  InventoryItemDto,
  InventoryItemFormValues,
  InventoryMovementDto,
  InventoryMovementFormValues,
} from '../schemas/inventory.schema'

export interface InventoryScreenProps {
  items: readonly InventoryItemDto[]
  movements: readonly InventoryMovementDto[]
  onSubmitItem: (
    values: InventoryItemFormValues,
    itemId: string | null,
  ) => Promise<string | null>
  onToggleItem: (itemId: string, isActive: boolean) => Promise<string | null>
  onRecordMovement: (values: InventoryMovementFormValues) => Promise<string | null>
  onCountItem: (values: InventoryCountFormValues) => Promise<InventoryCountOutcome>
  isLive: boolean
  schemaPending?: boolean
}
