'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toReconciliationFailure } from '../application/reconciliationFailure'
import { toBankAccountDto } from '../application/toReconciliationDto'
import { reconciliationRepositoryFor } from '../infrastructure/repository'
import { reconciliationMessages, toggleBankAccountSchema, type BankAccountDto, type ToggleBankAccountInput } from '../schemas/reconciliation.schema'

type Fields = 'accountId' | 'isActive'

const runToggleBankAccount = createAction<ToggleBankAccountInput, BankAccountDto, Fields>({
  name: 'bank_account.toggle_active',
  schema: toggleBankAccountSchema,
  roles: rolesWith('clinic.settings'),
  messages: { validation: reconciliationMessages.invalidFields, unavailable: reconciliationMessages.unavailable, unexpected: reconciliationMessages.unexpected },
  revalidatePaths: ['/conciliacao'],
  handler: async (input, context) => {
    try {
      const account = await reconciliationRepositoryFor(context.supabase).updateAccount(context.clinicId, input.accountId, input.isActive)
      return ok(toBankAccountDto(account))
    } catch (cause) {
      return toReconciliationFailure<Fields>('bank_account.toggle_active', cause)
    }
  },
  audit: (output) => ({ action: output.isActive ? 'bank_account.reactivated' : 'bank_account.archived', entityType: 'bank_account', entityId: output.id, after: { is_active: output.isActive } }),
})

export async function toggleBankAccountAction(rawInput: unknown): Promise<ActionResult<BankAccountDto, Fields>> {
  return runToggleBankAccount(rawInput)
}
