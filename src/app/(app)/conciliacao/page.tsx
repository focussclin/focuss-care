import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import {
  reconcileBankTransactionFromScreen,
  setBankTransactionStatusFromScreen,
  submitBankAccountFromScreen,
  submitBankTransactionFromScreen,
  toggleBankAccountFromScreen,
} from '@/modules/reconciliation/actions/reconciliationScreen.actions'
import {
  toBankAccountDto,
  toBankTransactionDto,
  toReconciliationCandidateDto,
} from '@/modules/reconciliation/application/toReconciliationDto'
import { isReconciliationRepositoryError } from '@/modules/reconciliation/domain/ReconciliationRepositoryError'
import { getReconciliationRepository } from '@/modules/reconciliation/infrastructure/repository'
import { ReconciliationScreen } from '@/modules/reconciliation/ui/ReconciliationScreen'

export const metadata: Metadata = {
  title: 'Conciliação bancária',
  description: 'Relacione transações bancárias às faturas e despesas da clínica.',
}

export default async function ReconciliationPage() {
  await connection()

  const source = await getReconciliationRepository()
  const role = await getActiveClinicRole()
  if (source.isLive && !can(role, 'invoice.read')) forbidden()

  let accounts = [] as Awaited<ReturnType<typeof source.repository.listAccounts>>
  let transactions = [] as Awaited<ReturnType<typeof source.repository.listTransactions>>
  let invoiceCandidates = [] as Awaited<ReturnType<typeof source.repository.listInvoiceCandidates>>
  let payableCandidates = [] as Awaited<ReturnType<typeof source.repository.listPayableCandidates>>
  let schemaPending = false

  try {
    const loaded = await Promise.all([
      source.repository.listAccounts(source.clinicId),
      source.repository.listTransactions(source.clinicId),
      source.repository.listInvoiceCandidates(source.clinicId),
      source.repository.listPayableCandidates(source.clinicId),
    ])
    accounts = loaded[0]
    transactions = loaded[1]
    invoiceCandidates = loaded[2]
    payableCandidates = loaded[3]
  } catch (cause) {
    if (isReconciliationRepositoryError(cause) && cause.reason === 'schema-not-ready') {
      schemaPending = true
    } else {
      throw cause
    }
  }

  return (
    <ReconciliationScreen
      accounts={accounts.map(toBankAccountDto)}
      transactions={transactions.map(toBankTransactionDto)}
      invoiceCandidates={invoiceCandidates.map(toReconciliationCandidateDto)}
      payableCandidates={payableCandidates.map(toReconciliationCandidateDto)}
      onSubmitAccount={submitBankAccountFromScreen}
      onToggleAccount={toggleBankAccountFromScreen}
      onSubmitTransaction={submitBankTransactionFromScreen}
      onReconcile={reconcileBankTransactionFromScreen}
      onChangeStatus={setBankTransactionStatusFromScreen}
      isLive={source.isLive}
      schemaPending={schemaPending}
    />
  )
}
