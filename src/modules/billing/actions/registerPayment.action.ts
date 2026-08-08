'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toBillingFailure } from '../application/billingFailure'
import { billingRepositoryFor } from '../infrastructure/repository'
import {
  billingMessages,
  registerPaymentSchema,
  type RegisterPaymentInput,
} from '../schemas/billing.schema'

type Field = 'amount' | 'method'

interface PaymentResult {
  id: string
  amountCents: number
  method: string
}

/**
 * Registra o pagamento — feature **B-01**.
 *
 * O adapter recusa valor acima do saldo devedor. A checagem vive lá, e não
 * aqui, porque depende de ler a fatura no banco — e é o banco que sabe quanto
 * já foi pago neste instante.
 *
 * Pagamento em espécie com caixa aberto também vira lançamento de caixa. Sem
 * isso, o turno fecharia com uma diferença do tamanho de tudo o que entrou em
 * dinheiro, e a diferença deixaria de significar alguma coisa.
 */
const runRegisterPayment = createAction<
  RegisterPaymentInput,
  PaymentResult,
  Field
>({
  name: 'payment.register',
  schema: registerPaymentSchema,
  roles: rolesWith('payment.write'),
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
      const payment = await repository.registerPayment(
        context.clinicId,
        {
          invoiceId: input.invoiceId,
          amountCents: input.amount,
          method: input.method,
          notes: input.notes,
        },
        context.userId,
      )

      return ok<PaymentResult>({
        id: payment.id,
        amountCents: payment.amountCents,
        method: payment.method,
      })
    } catch (cause) {
      return toBillingFailure<Field>('payment.register', cause)
    }
  },

  /**
   * Quem recebeu, quanto e como — o rastro que uma conferência de caixa precisa.
   *
   * O ator sai da sessão, pelo `recordAuditEvent`. A observação do pagamento
   * fica de fora: é texto livre e costuma citar o paciente.
   */
  audit: (output, input) => ({
    action: 'payment.registered',
    entityType: 'payment',
    entityId: output.id,
    after: {
      invoice_id: input.invoiceId,
      amount_cents: output.amountCents,
      method: output.method,
    },
  }),
})

export async function registerPaymentAction(
  rawInput: unknown,
): Promise<ActionResult<PaymentResult, Field>> {
  return runRegisterPayment(rawInput)
}
