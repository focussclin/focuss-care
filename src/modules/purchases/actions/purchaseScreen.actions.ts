'use server'

import { createPurchaseOrderAction } from './createPurchaseOrder.action'
import { createPurchaseSupplierAction } from './createPurchaseSupplier.action'
import { receivePurchaseOrderItemAction } from './receivePurchaseOrderItem.action'
import { togglePurchaseSupplierAction } from './togglePurchaseSupplier.action'
import { transitionPurchaseOrderAction } from './transitionPurchaseOrder.action'
import { updatePurchaseSupplierAction } from './updatePurchaseSupplier.action'
import type {
  PurchaseOrderFormValues,
  PurchaseSupplierFormValues,
  PurchaseOrderStatus,
} from '../schemas/purchase.schema'

export async function submitPurchaseSupplierFromScreen(
  values: PurchaseSupplierFormValues,
  supplierId: string | null,
): Promise<string | null> {
  const result = supplierId
    ? await updatePurchaseSupplierAction({ supplierId, ...values })
    : await createPurchaseSupplierAction(values)
  return result.ok ? null : result.error.message
}

export async function togglePurchaseSupplierFromScreen(
  supplierId: string,
  isActive: boolean,
): Promise<string | null> {
  const result = await togglePurchaseSupplierAction({ supplierId, isActive })
  return result.ok ? null : result.error.message
}

export async function submitPurchaseOrderFromScreen(
  values: PurchaseOrderFormValues,
): Promise<string | null> {
  const result = await createPurchaseOrderAction(values)
  return result.ok ? null : result.error.message
}

export async function transitionPurchaseOrderFromScreen(
  orderId: string,
  status: PurchaseOrderStatus,
): Promise<string | null> {
  const result = await transitionPurchaseOrderAction({ orderId, status })
  return result.ok ? null : result.error.message
}

export async function receivePurchaseOrderItemFromScreen(
  orderItemId: string,
  quantity: number,
): Promise<string | null> {
  const result = await receivePurchaseOrderItemAction({ orderItemId, quantity })
  return result.ok ? null : result.error.message
}
