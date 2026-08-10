import type {
  BankAccount,
  BankTransaction,
  BankTransactionStatus,
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
  /**
   * Troca `pending` ↔ `ignored`, e só isso.
   *
   * `from` não é redundante com `transactionId`: ele vai para o `WHERE` do
   * UPDATE, então a troca só acontece se a linha ainda estiver no estado que a
   * tela viu. É o que impede rebaixar para `ignored` uma transação que outra
   * pessoa conciliou nesse intervalo — o vínculo continuaria gravado,
   * apontando para uma transação que afirma não ter sido conciliada.
   */
  setTransactionStatus(
    clinicId: string,
    transactionId: string,
    from: BankTransactionStatus,
    to: BankTransactionStatus,
  ): Promise<BankTransaction>
  reconcileTransaction(clinicId: string, data: ReconcileBankTransactionData): Promise<BankTransactionReconciliationResult>
}

export interface BankTransactionReconciliationResult {
  id: string
  transactionId: string
  invoiceId: string | null
  payableId: string | null
  matchedAmountCents: number
}
