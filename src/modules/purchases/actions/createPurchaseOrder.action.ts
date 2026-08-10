'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toPurchaseFailure } from '../application/purchaseFailure'
import { toPurchaseOrderDto } from '../application/toPurchaseDto'
import { purchaseRepositoryFor } from '../infrastructure/repository'
import {
  createPurchaseOrderSchema,
  purchaseMessages,
  type CreatePurchaseOrderInput,
  type PurchaseOrderDto,
} from '../schemas/purchase.schema'

type Fields = 'supplierId' | 'expectedDeliveryDate' | 'notes' | 'items'

const runCreatePurchaseOrder = createAction<
  CreatePurchaseOrderInput,
  PurchaseOrderDto,
  Fields
>({
  name: 'purchase_order.create',
  schema: createPurchaseOrderSchema,
  roles: rolesWith('invoice.write'),
  messages: { validation: purchaseMessages.invalidFields, unavailable: purchaseMessages.unavailable, unexpected: purchaseMessages.unexpected },
  revalidatePaths: ['/compras'],
  handler: async (input, context) => {
    try {
      const order = await purchaseRepositoryFor(context.supabase).createOrder(
        context.clinicId,
        {
          supplierId: input.supplierId,
          expectedDeliveryDate: input.expectedDeliveryDate,
          notes: input.notes,
          items: input.items,
        },
      )
      return ok(toPurchaseOrderDto(order))
    } catch (cause) {
      return toPurchaseFailure<Fields>('purchase_order.create', cause)
    }
  },
  audit: (output) => ({
    action: 'purchase_order.created',
    entityType: 'purchase_order',
    entityId: output.id,
    after: { total_cents: output.totalCents, supplier_id: output.supplier.id },
  }),
})

export async function createPurchaseOrderAction(
  rawInput: unknown,
): Promise<ActionResult<PurchaseOrderDto, Fields>> {
  return runCreatePurchaseOrder(rawInput)
}
