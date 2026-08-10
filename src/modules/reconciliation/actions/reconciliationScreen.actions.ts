'use server'

import { createBankAccountAction } from './createBankAccount.action'
import { createBankTransactionAction } from './createBankTransaction.action'
import { reconcileBankTransactionAction } from './reconcileBankTransaction.action'
import { setBankTransactionStatusAction } from './setBankTransactionStatus.action'
import { toggleBankAccountAction } from './toggleBankAccount.action'
import type { BankAccountFormValues, BankTransactionFormValues, BankTransactionStatus, ReconcileFormValues } from '../schemas/reconciliation.schema'

export async function submitBankAccountFromScreen(values: BankAccountFormValues): Promise<string | null> {
  const result = await createBankAccountAction(values)
  return result.ok ? null : result.error.message
}

export async function toggleBankAccountFromScreen(accountId: string, isActive: boolean): Promise<string | null> {
  const result = await toggleBankAccountAction({ accountId, isActive })
  return result.ok ? null : result.error.message
}

export async function submitBankTransactionFromScreen(values: BankTransactionFormValues): Promise<string | null> {
  const result = await createBankTransactionAction(values)
  return result.ok ? null : result.error.message
}

export async function reconcileBankTransactionFromScreen(values: ReconcileFormValues): Promise<string | null> {
  const result = await reconcileBankTransactionAction(values)
  return result.ok ? null : result.error.message
}

export async function setBankTransactionStatusFromScreen(transactionId: string, from: BankTransactionStatus, to: BankTransactionStatus): Promise<string | null> {
  const result = await setBankTransactionStatusAction({ transactionId, from, to })
  return result.ok ? null : result.error.message
}
