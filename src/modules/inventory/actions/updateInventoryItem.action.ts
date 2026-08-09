'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toInventoryFailure } from '../application/inventoryFailure'
import { toInventoryItemDto } from '../application/toInventoryDto'
import { inventoryRepositoryFor } from '../infrastructure/repository'
import { inventoryMessages, type InventoryItemDto, type UpdateInventoryItemInput, updateInventoryItemSchema } from '../schemas/inventory.schema'

type Fields = 'itemId' | 'name' | 'sku' | 'unit' | 'minimumQuantity' | 'notes'

const runUpdateInventoryItem = createAction<UpdateInventoryItemInput, InventoryItemDto, Fields>({
  name: 'inventory_item.update',
  schema: updateInventoryItemSchema,
  roles: rolesWith('clinic.settings'),
  messages: { validation: inventoryMessages.invalidFields, unavailable: inventoryMessages.unavailable, unexpected: inventoryMessages.unexpected },
  revalidatePaths: ['/estoque'],
  handler: async (input, context) => {
    try {
      const item = await inventoryRepositoryFor(context.supabase).updateItem(context.clinicId, input.itemId, {
        name: input.name,
        sku: input.sku,
        unit: input.unit,
        minimumQuantity: input.minimumQuantity,
        notes: input.notes,
      })
      return ok(toInventoryItemDto(item))
    } catch (cause) {
      return toInventoryFailure<Fields>('inventory_item.update', cause)
    }
  },
  audit: (output) => ({ action: 'inventory_item.updated', entityType: 'inventory_item', entityId: output.id, after: { name: output.name, minimum_quantity: output.minimumQuantity } }),
})

export async function updateInventoryItemAction(rawInput: unknown): Promise<ActionResult<InventoryItemDto, Fields>> {
  return runUpdateInventoryItem(rawInput)
}
