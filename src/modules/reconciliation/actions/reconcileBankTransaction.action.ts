'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toReconciliationFailure } from '../application/reconciliationFailure'
import { reconciliationRepositoryFor } from '../infrastructure/repository'
import { reconciliationMessages, reconcileBankTransactionSchema, type BankReconciliationDto, type ReconcileBankTransactionInput } from '../schemas/reconciliation.schema'

type Fields = 'transactionId' | 'invoiceId' | 'payableId' | 'notes'

const runReconcileBankTransaction = createAction<ReconcileBankTransactionInput, BankReconciliationDto, Fields>({
  name: 'bank_transaction.reconcile',
  schema: reconcileBankTransactionSchema,
  roles: rolesWith('invoice.write'),
  messages: { validation: reconciliationMessages.invalidFields, unavailable: reconciliationMessages.unavailable, unexpected: reconciliationMessages.unexpected },
  revalidatePaths: ['/conciliacao'],
  handler: async (input, context) => {
    try {
      const result = await reconciliationRepositoryFor(context.supabase).reconcileTransaction(context.clinicId, context.userId, input)
      return ok(result)
    } catch (cause) {
      return toReconciliationFailure<Fields>('bank_transaction.reconcile', cause)
    }
  },
  audit: (output) => ({ action: 'bank_transaction.reconciled', entityType: 'bank_reconciliation', entityId: output.id, after: { transaction_id: output.transactionId, invoice_id: output.invoiceId, payable_id: output.payableId } }),
})

export async function reconcileBankTransactionAction(rawInput: unknown): Promise<ActionResult<BankReconciliationDto, Fields>> {
  return runReconcileBankTransaction(rawInput)
}
