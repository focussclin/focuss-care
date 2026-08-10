'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toPurchaseFailure } from '../application/purchaseFailure'
import { purchaseRepositoryFor } from '../infrastructure/repository'
import {
  purchaseMessages,
  receivePurchaseOrderItemSchema,
  type PurchaseOrderItemDto,
  type ReceivePurchaseOrderItemInput,
} from '../schemas/purchase.schema'

type Fields = 'orderItemId' | 'quantity'

const runReceivePurchaseOrderItem = createAction<
  ReceivePurchaseOrderItemInput,
  PurchaseOrderItemDto,
  Fields
>({
  name: 'purchase_order.receive_item',
  schema: receivePurchaseOrderItemSchema,
  roles: rolesWith('invoice.write'),
  messages: { validation: purchaseMessages.invalidFields, unavailable: purchaseMessages.unavailable, unexpected: purchaseMessages.unexpected },
  revalidatePaths: ['/compras', '/estoque'],
  handler: async (input, context) => {
    try {
      const item = await purchaseRepositoryFor(context.supabase).receiveOrderItem(
        context.clinicId,
        input.orderItemId,
        context.userId,
        input.quantity,
      )
      return ok({
        id: item.id,
        inventoryItemId: item.inventoryItemId,
        inventoryItemName: item.inventoryItemName,
        inventoryItemUnit: item.inventoryItemUnit,
        quantity: item.quantity,
        unitCostCents: item.unitCostCents,
        receivedQuantity: item.receivedQuantity,
      })
    } catch (cause) {
      return toPurchaseFailure<Fields>('purchase_order.receive_item', cause)
    }
  },
  audit: (output) => ({
    action: 'purchase_order.item_received',
    entityType: 'purchase_order_item',
    entityId: output.id,
    after: { inventory_item_id: output.inventoryItemId, received_quantity: output.receivedQuantity },
  }),
})

export async function receivePurchaseOrderItemAction(
  rawInput: unknown,
): Promise<ActionResult<PurchaseOrderItemDto, Fields>> {
  return runReceivePurchaseOrderItem(rawInput)
}
