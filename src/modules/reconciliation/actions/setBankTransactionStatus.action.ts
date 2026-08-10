'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { canChangeStatusManually } from '../domain/Reconciliation'
import { toReconciliationFailure } from '../application/reconciliationFailure'
import { toBankTransactionDto } from '../application/toReconciliationDto'
import { reconciliationRepositoryFor } from '../infrastructure/repository'
import {
  reconciliationMessages,
  type BankTransactionDto,
  type SetBankTransactionStatusInput,
  setBankTransactionStatusSchema,
} from '../schemas/reconciliation.schema'

type Fields = 'transactionId' | 'from' | 'to'

/**
 * Descarta da fila uma transação que nunca vai casar — ou traz de volta a que
 * foi descartada por engano.
 *
 * Tarifa, transferência entre contas da própria clínica e estorno duplicado não
 * têm fatura nem despesa correspondente. Sem poder descartá-los, a fila de
 * pendências só cresce, e o número no topo da tela deixa de significar
 * "trabalho a fazer".
 *
 * `reconciled` fica de fora nos dois sentidos, e a checagem é dupla: aqui, com
 * a tabela do domínio, e no `WHERE` do UPDATE — que é o que resolve a corrida
 * com alguém conciliando ao mesmo tempo.
 */
const runSetBankTransactionStatus = createAction<
  SetBankTransactionStatusInput,
  BankTransactionDto,
  Fields
>({
  name: 'bank_transaction.status',
  schema: setBankTransactionStatusSchema,
  roles: rolesWith('invoice.write'),
  messages: {
    validation: reconciliationMessages.invalidFields,
    unavailable: reconciliationMessages.unavailable,
    unexpected: reconciliationMessages.unexpected,
  },
  revalidatePaths: ['/conciliacao'],
  handler: async (input, context) => {
    if (!canChangeStatusManually(input.from, input.to)) {
      return toReconciliationFailure<Fields>(
        'bank_transaction.status',
        new Error('transição manual não permitida'),
      )
    }

    try {
      const transaction = await reconciliationRepositoryFor(
        context.supabase,
      ).setTransactionStatus(context.clinicId, input.transactionId, input.from, input.to)
      return ok(toBankTransactionDto(transaction))
    } catch (cause) {
      return toReconciliationFailure<Fields>('bank_transaction.status', cause)
    }
  },
  audit: (output) => ({
    action: output.status === 'ignored' ? 'bank_transaction.ignored' : 'bank_transaction.restored',
    entityType: 'bank_transaction',
    entityId: output.id,
    after: { status: output.status, amount_cents: output.amountCents },
  }),
})

export async function setBankTransactionStatusAction(
  rawInput: unknown,
): Promise<ActionResult<BankTransactionDto, Fields>> {
  return runSetBankTransactionStatus(rawInput)
}
