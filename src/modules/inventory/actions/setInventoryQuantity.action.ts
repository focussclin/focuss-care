'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toInventoryFailure } from '../application/inventoryFailure'
import { toInventoryMovementDto } from '../application/toInventoryDto'
import { inventoryRepositoryFor } from '../infrastructure/repository'
import {
  inventoryMessages,
  type InventoryMovementDto,
  type SetInventoryQuantityInput,
  setInventoryQuantitySchema,
} from '../schemas/inventory.schema'

type Fields = 'itemId' | 'countedQuantity' | 'reason'

/**
 * Ajuste de saldo por contagem de inventário.
 *
 * A action manda o que foi **contado**; quem calcula a diferença é
 * `set_inventory_quantity`, dentro do lock. Não existe leitura do saldo aqui de
 * propósito — ler para subtrair criaria a corrida que a função do banco evita.
 *
 * Sucesso com `null` significa contagem igual ao saldo: nada mudou, nada é
 * auditado.
 */
const runSetInventoryQuantity = createAction<
  SetInventoryQuantityInput,
  InventoryMovementDto | null,
  Fields
>({
  name: 'inventory_movement.count',
  schema: setInventoryQuantitySchema,
  roles: rolesWith('invoice.write'),
  messages: {
    validation: inventoryMessages.invalidFields,
    unavailable: inventoryMessages.unavailable,
    unexpected: inventoryMessages.unexpected,
  },
  revalidatePaths: ['/estoque'],
  handler: async (input, context) => {
    try {
      const movement = await inventoryRepositoryFor(context.supabase).setQuantity(
        context.clinicId,
        {
          itemId: input.itemId,
          countedQuantity: input.countedQuantity,
          reason: input.reason,
        },
      )
      return ok(movement ? toInventoryMovementDto(movement) : null)
    } catch (cause) {
      return toInventoryFailure<Fields>('inventory_movement.count', cause)
    }
  },
  audit: (output) =>
    output
      ? {
          action: 'inventory_movement.count',
          entityType: 'inventory_movement',
          entityId: output.id,
          after: {
            item_id: output.itemId,
            counted_quantity: output.countedQuantity,
            movement_type: output.movementType,
            quantity: output.quantity,
          },
        }
      : null,
})

export async function setInventoryQuantityAction(
  rawInput: unknown,
): Promise<ActionResult<InventoryMovementDto | null, Fields>> {
  return runSetInventoryQuantity(rawInput)
}
