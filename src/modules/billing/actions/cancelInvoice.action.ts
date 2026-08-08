'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toBillingFailure } from '../application/billingFailure'
import { toInvoiceDto } from '../application/toBillingDto'
import { billingRepositoryFor } from '../infrastructure/repository'
import {
  billingMessages,
  cancelInvoiceSchema,
  type CancelInvoiceInput,
  type InvoiceDto,
} from '../schemas/billing.schema'

type Field = 'reason'

/**
 * Cancela a cobrança — feature **B-01**.
 *
 * Cancelar **não apaga**: a linha continua com `canceled_at` e o motivo. E o
 * adapter recusa cancelar cobrança que já recebeu pagamento — dinheiro que
 * entrou não desaparece porque alguém cancelou a cobrança, e a linha passaria a
 * mentir sobre o que aconteceu.
 */
const runCancelInvoice = createAction<CancelInvoiceInput, InvoiceDto, Field>({
  name: 'invoice.cancel',
  schema: cancelInvoiceSchema,
  roles: rolesWith('invoice.write'),
  messages: {
    forbidden: billingMessages.forbidden,
    validation: billingMessages.invalidFields,
    unavailable: billingMessages.unavailable,
    unexpected: billingMessages.unexpected,
  },
  revalidatePaths: ['/financeiro'],

  handler: async (input, context) => {
    const repository = billingRepositoryFor(context.supabase)

    try {
      const invoice = await repository.cancelInvoice(
        context.clinicId,
        input.invoiceId,
        input.reason,
      )

      return ok<InvoiceDto>(toInvoiceDto(invoice))
    } catch (cause) {
      return toBillingFailure<Field>('invoice.cancel', cause)
    }
  },

  /** O motivo fica em `invoices.cancel_reason`, não no log: é texto livre. */
  audit: (output) => ({
    action: 'invoice.canceled',
    entityType: 'invoice',
    entityId: output.id,
    after: { status: output.status, total_cents: output.totalCents },
  }),
})

export async function cancelInvoiceAction(
  rawInput: unknown,
): Promise<ActionResult<InvoiceDto, Field>> {
  return runCancelInvoice(rawInput)
}
