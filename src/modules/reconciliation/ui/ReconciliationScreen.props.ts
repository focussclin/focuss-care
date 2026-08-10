import type {
  BankAccountDto,
  BankAccountFormValues,
  BankTransactionDto,
  BankTransactionFormValues,
  BankTransactionStatus,
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
  /**
   * `from` é o estado que a tela viu, e vai para o `WHERE` do UPDATE — sem ele
   * a troca atropelaria uma conciliação feita por outra pessoa nesse intervalo.
   */
  onChangeStatus: (
    transactionId: string,
    from: BankTransactionStatus,
    to: BankTransactionStatus,
  ) => Promise<string | null>
  isLive: boolean
  schemaPending?: boolean
}
