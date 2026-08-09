'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toInventoryFailure } from '../application/inventoryFailure'
import { toInventoryItemDto } from '../application/toInventoryDto'
import { inventoryRepositoryFor } from '../infrastructure/repository'
import { inventoryMessages, type InventoryItemDto, type ToggleInventoryItemInput, toggleInventoryItemSchema } from '../schemas/inventory.schema'

type Fields = 'itemId' | 'isActive'

const runToggleInventoryItem = createAction<ToggleInventoryItemInput, InventoryItemDto, Fields>({
  name: 'inventory_item.toggle_active',
  schema: toggleInventoryItemSchema,
  roles: rolesWith('clinic.settings'),
  messages: { validation: inventoryMessages.invalidFields, unavailable: inventoryMessages.unavailable, unexpected: inventoryMessages.unexpected },
  revalidatePaths: ['/estoque'],
  handler: async (input, context) => {
    try {
      const item = await inventoryRepositoryFor(context.supabase).setItemActive(context.clinicId, input.itemId, input.isActive)
      return ok(toInventoryItemDto(item))
    } catch (cause) {
      return toInventoryFailure<Fields>('inventory_item.toggle_active', cause)
    }
  },
  audit: (output) => ({ action: output.isActive ? 'inventory_item.reactivated' : 'inventory_item.archived', entityType: 'inventory_item', entityId: output.id, after: { is_active: output.isActive } }),
})

export async function toggleInventoryItemAction(rawInput: unknown): Promise<ActionResult<InventoryItemDto, Fields>> {
  return runToggleInventoryItem(rawInput)
}
