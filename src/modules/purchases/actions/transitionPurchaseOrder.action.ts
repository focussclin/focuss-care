'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toPurchaseFailure } from '../application/purchaseFailure'
import { toPurchaseOrderDto } from '../application/toPurchaseDto'
import { purchaseRepositoryFor } from '../infrastructure/repository'
import {
  purchaseMessages,
  transitionPurchaseOrderSchema,
  type PurchaseOrderDto,
  type TransitionPurchaseOrderInput,
} from '../schemas/purchase.schema'

type Fields = 'orderId' | 'status'

const runTransitionPurchaseOrder = createAction<
  TransitionPurchaseOrderInput,
  PurchaseOrderDto,
  Fields
>({
  name: 'purchase_order.transition',
  schema: transitionPurchaseOrderSchema,
  roles: rolesWith('invoice.write'),
  messages: { validation: purchaseMessages.invalidFields, unavailable: purchaseMessages.unavailable, unexpected: purchaseMessages.unexpected },
  revalidatePaths: ['/compras'],
  handler: async (input, context) => {
    try {
      const order = await purchaseRepositoryFor(context.supabase).transitionOrder(
        context.clinicId,
        input.orderId,
        input.status,
      )
      return ok(toPurchaseOrderDto(order))
    } catch (cause) {
      return toPurchaseFailure<Fields>('purchase_order.transition', cause)
    }
  },
  audit: (output) => ({
    action: `purchase_order.${output.status}`,
    entityType: 'purchase_order',
    entityId: output.id,
    after: { status: output.status },
  }),
})

export async function transitionPurchaseOrderAction(
  rawInput: unknown,
): Promise<ActionResult<PurchaseOrderDto, Fields>> {
  return runTransitionPurchaseOrder(rawInput)
}
