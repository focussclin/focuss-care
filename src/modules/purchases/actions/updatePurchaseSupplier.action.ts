'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toPurchaseFailure } from '../application/purchaseFailure'
import { toPurchaseSupplierDto } from '../application/toPurchaseDto'
import { purchaseRepositoryFor } from '../infrastructure/repository'
import {
  purchaseMessages,
  updatePurchaseSupplierSchema,
  type PurchaseSupplierDto,
  type UpdatePurchaseSupplierInput,
} from '../schemas/purchase.schema'

type Fields = 'supplierId' | 'name' | 'taxId' | 'email' | 'phone' | 'notes'

const runUpdatePurchaseSupplier = createAction<
  UpdatePurchaseSupplierInput,
  PurchaseSupplierDto,
  Fields
>({
  name: 'purchase_supplier.update',
  schema: updatePurchaseSupplierSchema,
  roles: rolesWith('clinic.settings'),
  messages: { validation: purchaseMessages.invalidFields, unavailable: purchaseMessages.unavailable, unexpected: purchaseMessages.unexpected },
  revalidatePaths: ['/compras'],
  handler: async (input, context) => {
    try {
      const supplier = await purchaseRepositoryFor(context.supabase).updateSupplier(
        context.clinicId,
        input.supplierId,
        {
          name: input.name,
          taxId: input.taxId,
          email: input.email,
          phone: input.phone,
          notes: input.notes,
        },
      )
      return ok(toPurchaseSupplierDto(supplier))
    } catch (cause) {
      return toPurchaseFailure<Fields>('purchase_supplier.update', cause)
    }
  },
  audit: (output) => ({
    action: 'purchase_supplier.updated',
    entityType: 'purchase_supplier',
    entityId: output.id,
    after: { name: output.name },
  }),
})

export async function updatePurchaseSupplierAction(
  rawInput: unknown,
): Promise<ActionResult<PurchaseSupplierDto, Fields>> {
  return runUpdatePurchaseSupplier(rawInput)
}
