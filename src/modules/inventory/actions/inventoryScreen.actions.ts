'use server'

import { createInventoryItemAction } from './createInventoryItem.action'
import { recordInventoryMovementAction } from './recordInventoryMovement.action'
import { setInventoryQuantityAction } from './setInventoryQuantity.action'
import { toggleInventoryItemAction } from './toggleInventoryItem.action'
import { updateInventoryItemAction } from './updateInventoryItem.action'
import type { InventoryCountFormValues, InventoryCountOutcome, InventoryItemFormValues, InventoryMovementFormValues } from '../schemas/inventory.schema'

export async function submitInventoryItemFromScreen(values: InventoryItemFormValues, itemId: string | null): Promise<string | null> {
  const result = itemId ? await updateInventoryItemAction({ itemId, ...values }) : await createInventoryItemAction(values)
  return result.ok ? null : result.error.message
}

export async function toggleInventoryItemFromScreen(itemId: string, isActive: boolean): Promise<string | null> {
  const result = await toggleInventoryItemAction({ itemId, isActive })
  return result.ok ? null : result.error.message
}

export async function recordInventoryMovementFromScreen(values: InventoryMovementFormValues): Promise<string | null> {
  const result = await recordInventoryMovementAction(values)
  return result.ok ? null : result.error.message
}

export async function setInventoryQuantityFromScreen(values: InventoryCountFormValues): Promise<InventoryCountOutcome> {
  const result = await setInventoryQuantityAction(values)
  if (!result.ok) return { status: 'error', message: result.error.message }
  // `data` nulo é a contagem que bateu com o saldo — sucesso sem movimento.
  return { status: result.data ? 'adjusted' : 'unchanged' }
}
