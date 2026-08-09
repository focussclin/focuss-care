'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toPurchaseFailure } from '../application/purchaseFailure'
import { toPurchaseSupplierDto } from '../application/toPurchaseDto'
import { purchaseRepositoryFor } from '../infrastructure/repository'
import {
  createPurchaseSupplierSchema,
  purchaseMessages,
  type CreatePurchaseSupplierInput,
  type PurchaseSupplierDto,
} from '../schemas/purchase.schema'

type Fields = 'name' | 'taxId' | 'email' | 'phone' | 'notes'

const runCreatePurchaseSupplier = createAction<
  CreatePurchaseSupplierInput,
  PurchaseSupplierDto,
  Fields
>({
  name: 'purchase_supplier.create',
  schema: createPurchaseSupplierSchema,
  roles: rolesWith('clinic.settings'),
  messages: { validation: purchaseMessages.invalidFields, unavailable: purchaseMessages.unavailable, unexpected: purchaseMessages.unexpected },
  revalidatePaths: ['/compras'],
  handler: async (input, context) => {
    try {
      const supplier = await purchaseRepositoryFor(context.supabase).createSupplier(
        context.clinicId,
        context.userId,
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
      return toPurchaseFailure<Fields>('purchase_supplier.create', cause)
    }
  },
  audit: (output) => ({
    action: 'purchase_supplier.created',
    entityType: 'purchase_supplier',
    entityId: output.id,
    after: { name: output.name },
  }),
})

export async function createPurchaseSupplierAction(
  rawInput: unknown,
): Promise<ActionResult<PurchaseSupplierDto, Fields>> {
  return runCreatePurchaseSupplier(rawInput)
}
