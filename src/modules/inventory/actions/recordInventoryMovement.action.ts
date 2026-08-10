'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toInventoryFailure } from '../application/inventoryFailure'
import { toInventoryMovementDto } from '../application/toInventoryDto'
import { inventoryRepositoryFor } from '../infrastructure/repository'
import { inventoryMessages, type InventoryMovementDto, type RecordInventoryMovementInput, recordInventoryMovementSchema } from '../schemas/inventory.schema'

type Fields = 'itemId' | 'movementType' | 'quantity' | 'unitCostCents' | 'reason'

const runRecordInventoryMovement = createAction<RecordInventoryMovementInput, InventoryMovementDto, Fields>({
  name: 'inventory_movement.create',
  schema: recordInventoryMovementSchema,
  roles: rolesWith('invoice.write'),
  messages: { validation: inventoryMessages.invalidFields, unavailable: inventoryMessages.unavailable, unexpected: inventoryMessages.unexpected },
  revalidatePaths: ['/estoque'],
  handler: async (input, context) => {
    try {
      const movement = await inventoryRepositoryFor(context.supabase).recordMovement(context.clinicId, context.userId, {
        itemId: input.itemId,
        movementType: input.movementType,
        quantity: input.quantity,
        unitCostCents: input.unitCostCents,
        reason: input.reason,
      })
      return ok(toInventoryMovementDto(movement))
    } catch (cause) {
      return toInventoryFailure<Fields>('inventory_movement.create', cause)
    }
  },
  audit: (output) => ({ action: output.movementType === 'in' ? 'inventory_movement.in' : 'inventory_movement.out', entityType: 'inventory_movement', entityId: output.id, after: { item_id: output.itemId, quantity: output.quantity } }),
})

export async function recordInventoryMovementAction(rawInput: unknown): Promise<ActionResult<InventoryMovementDto, Fields>> {
  return runRecordInventoryMovement(rawInput)
}
