import type {
  BankAccountDto,
  BankAccountFormValues,
  BankTransactionDto,
  BankTransactionFormValues,
  ReconcileFormValues,
  ReconciliationCandidateDto,
} from '../schemas/reconciliation.schema'

export interface ReconciliationScreenProps {
  accounts: readonly BankAccountDto[]
  transactions: readonly BankTransactionDto[]
  invoiceCandidates: readonly ReconciliationCandidateDto[]
  payableCandidates: readonly ReconciliationCandidateDto[]
  onSubmitAccount: (values: BankAccountFormValues) => Promise<string | null>
  onToggleAccount: (accountId: string, isActive: boolean) => Promise<string | null>
  onSubmitTransaction: (values: BankTransactionFormValues) => Promise<string | null>
  onReconcile: (values: ReconcileFormValues) => Promise<string | null>
  isLive: boolean
  schemaPending?: boolean
}
