'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toBankAccountDto } from '../application/toReconciliationDto'
import { toReconciliationFailure } from '../application/reconciliationFailure'
import { reconciliationRepositoryFor } from '../infrastructure/repository'
import { createBankAccountSchema, reconciliationMessages, type BankAccountDto, type CreateBankAccountInput } from '../schemas/reconciliation.schema'

type Fields = 'name' | 'bankName' | 'lastFour' | 'notes'

const runCreateBankAccount = createAction<CreateBankAccountInput, BankAccountDto, Fields>({
  name: 'bank_account.create',
  schema: createBankAccountSchema,
  roles: rolesWith('clinic.settings'),
  messages: { validation: reconciliationMessages.invalidFields, unavailable: reconciliationMessages.unavailable, unexpected: reconciliationMessages.unexpected },
  revalidatePaths: ['/conciliacao'],
  handler: async (input, context) => {
    try {
      const account = await reconciliationRepositoryFor(context.supabase).createAccount(context.clinicId, context.userId, input)
      return ok(toBankAccountDto(account))
    } catch (cause) {
      return toReconciliationFailure<Fields>('bank_account.create', cause)
    }
  },
  audit: (output) => ({ action: 'bank_account.created', entityType: 'bank_account', entityId: output.id, after: { name: output.name } }),
})

export async function createBankAccountAction(rawInput: unknown): Promise<ActionResult<BankAccountDto, Fields>> {
  return runCreateBankAccount(rawInput)
}
