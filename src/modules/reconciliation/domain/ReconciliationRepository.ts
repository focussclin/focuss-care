import type {
  BankAccount,
  BankTransaction,
  NewBankAccountData,
  NewBankTransactionData,
  ReconcileBankTransactionData,
  ReconciliationCandidate,
} from './Reconciliation'

export interface ReconciliationRepository {
  listAccounts(clinicId: string): Promise<BankAccount[]>
  listTransactions(clinicId: string): Promise<BankTransaction[]>
  listInvoiceCandidates(clinicId: string): Promise<ReconciliationCandidate[]>
  listPayableCandidates(clinicId: string): Promise<ReconciliationCandidate[]>
  createAccount(clinicId: string, createdBy: string, data: NewBankAccountData): Promise<BankAccount>
  updateAccount(clinicId: string, accountId: string, isActive: boolean): Promise<BankAccount>
  createTransaction(clinicId: string, createdBy: string, data: NewBankTransactionData): Promise<BankTransaction>
  reconcileTransaction(clinicId: string, data: ReconcileBankTransactionData): Promise<BankTransactionReconciliationResult>
}

export interface BankTransactionReconciliationResult {
  id: string
  transactionId: string
  invoiceId: string | null
  payableId: string | null
  matchedAmountCents: number
}
