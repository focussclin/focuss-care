'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toPurchaseFailure } from '../application/purchaseFailure'
import { toPurchaseSupplierDto } from '../application/toPurchaseDto'
import { purchaseRepositoryFor } from '../infrastructure/repository'
import {
  purchaseMessages,
  togglePurchaseSupplierSchema,
  type PurchaseSupplierDto,
  type TogglePurchaseSupplierInput,
} from '../schemas/purchase.schema'

type Fields = 'supplierId' | 'isActive'

const runTogglePurchaseSupplier = createAction<
  TogglePurchaseSupplierInput,
  PurchaseSupplierDto,
  Fields
>({
  name: 'purchase_supplier.toggle_active',
  schema: togglePurchaseSupplierSchema,
  roles: rolesWith('clinic.settings'),
  messages: { validation: purchaseMessages.invalidFields, unavailable: purchaseMessages.unavailable, unexpected: purchaseMessages.unexpected },
  revalidatePaths: ['/compras'],
  handler: async (input, context) => {
    try {
      const supplier = await purchaseRepositoryFor(context.supabase).updateSupplier(
        context.clinicId,
        input.supplierId,
        { isActive: input.isActive },
      )
      return ok(toPurchaseSupplierDto(supplier))
    } catch (cause) {
      return toPurchaseFailure<Fields>('purchase_supplier.toggle_active', cause)
    }
  },
  audit: (output) => ({
    action: output.isActive ? 'purchase_supplier.reactivated' : 'purchase_supplier.archived',
    entityType: 'purchase_supplier',
    entityId: output.id,
    after: { is_active: output.isActive },
  }),
})

export async function togglePurchaseSupplierAction(
  rawInput: unknown,
): Promise<ActionResult<PurchaseSupplierDto, Fields>> {
  return runTogglePurchaseSupplier(rawInput)
}
