'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toInventoryFailure } from '../application/inventoryFailure'
import { toInventoryItemDto } from '../application/toInventoryDto'
import { inventoryRepositoryFor } from '../infrastructure/repository'
import { createInventoryItemSchema, inventoryMessages, type CreateInventoryItemInput, type InventoryItemDto } from '../schemas/inventory.schema'

type Fields = 'name' | 'sku' | 'unit' | 'minimumQuantity' | 'notes'

const runCreateInventoryItem = createAction<CreateInventoryItemInput, InventoryItemDto, Fields>({
  name: 'inventory_item.create',
  schema: createInventoryItemSchema,
  roles: rolesWith('clinic.settings'),
  messages: { validation: inventoryMessages.invalidFields, unavailable: inventoryMessages.unavailable, unexpected: inventoryMessages.unexpected },
  revalidatePaths: ['/estoque'],
  handler: async (input, context) => {
    try {
      const item = await inventoryRepositoryFor(context.supabase).createItem(context.clinicId, context.userId, {
        name: input.name,
        sku: input.sku,
        unit: input.unit,
        minimumQuantity: input.minimumQuantity,
        notes: input.notes,
      })
      return ok(toInventoryItemDto(item))
    } catch (cause) {
      return toInventoryFailure<Fields>('inventory_item.create', cause)
    }
  },
  audit: (output) => ({ action: 'inventory_item.created', entityType: 'inventory_item', entityId: output.id, after: { name: output.name, sku: output.sku } }),
})

export async function createInventoryItemAction(rawInput: unknown): Promise<ActionResult<InventoryItemDto, Fields>> {
  return runCreateInventoryItem(rawInput)
}
