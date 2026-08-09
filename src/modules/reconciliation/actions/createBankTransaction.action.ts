'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toReconciliationFailure } from '../application/reconciliationFailure'
import { toBankTransactionDto } from '../application/toReconciliationDto'
import { reconciliationRepositoryFor } from '../infrastructure/repository'
import { createBankTransactionSchema, reconciliationMessages, type BankTransactionDto, type CreateBankTransactionInput } from '../schemas/reconciliation.schema'

type Fields = 'bankAccountId' | 'occurredOn' | 'direction' | 'amountCents' | 'description' | 'externalId' | 'notes'

const runCreateBankTransaction = createAction<CreateBankTransactionInput, BankTransactionDto, Fields>({
  name: 'bank_transaction.create',
  schema: createBankTransactionSchema,
  roles: rolesWith('invoice.write'),
  messages: { validation: reconciliationMessages.invalidFields, unavailable: reconciliationMessages.unavailable, unexpected: reconciliationMessages.unexpected },
  revalidatePaths: ['/conciliacao'],
  handler: async (input, context) => {
    try {
      const transaction = await reconciliationRepositoryFor(context.supabase).createTransaction(context.clinicId, context.userId, input)
      return ok(toBankTransactionDto(transaction))
    } catch (cause) {
      return toReconciliationFailure<Fields>('bank_transaction.create', cause)
    }
  },
  audit: (output) => ({ action: 'bank_transaction.created', entityType: 'bank_transaction', entityId: output.id, after: { direction: output.direction, amount_cents: output.amountCents } }),
})

export async function createBankTransactionAction(rawInput: unknown): Promise<ActionResult<BankTransactionDto, Fields>> {
  return runCreateBankTransaction(rawInput)
}
