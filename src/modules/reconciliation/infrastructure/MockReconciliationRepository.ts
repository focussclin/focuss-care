import type {
  BankAccount,
  BankTransaction,
  BankTransactionStatus,
  NewBankAccountData,
  NewBankTransactionData,
  ReconcileBankTransactionData,
  ReconciliationCandidate,
} from '../domain/Reconciliation'
import type { BankTransactionReconciliationResult, ReconciliationRepository } from '../domain/ReconciliationRepository'
import { ReconciliationRepositoryError } from '../domain/ReconciliationRepositoryError'

/** Demonstração vazia: não inventa saldo, conta, extrato ou conciliação. */
export class MockReconciliationRepository implements ReconciliationRepository {
  async listAccounts(clinicId: string): Promise<BankAccount[]> { void clinicId; return [] }
  async listTransactions(clinicId: string): Promise<BankTransaction[]> { void clinicId; return [] }
  async listInvoiceCandidates(clinicId: string): Promise<ReconciliationCandidate[]> { void clinicId; return [] }
  async listPayableCandidates(clinicId: string): Promise<ReconciliationCandidate[]> { void clinicId; return [] }
  async createAccount(clinicId: string, createdBy: string, data: NewBankAccountData): Promise<BankAccount> { void clinicId; void createdBy; void data; throw unavailable() }
  async updateAccount(clinicId: string, accountId: string, isActive: boolean): Promise<BankAccount> { void clinicId; void accountId; void isActive; throw unavailable() }
  async createTransaction(clinicId: string, createdBy: string, data: NewBankTransactionData): Promise<BankTransaction> { void clinicId; void createdBy; void data; throw unavailable() }
  async setTransactionStatus(clinicId: string, transactionId: string, from: BankTransactionStatus, to: BankTransactionStatus): Promise<BankTransaction> { void clinicId; void transactionId; void from; void to; throw unavailable() }
  async reconcileTransaction(clinicId: string, data: ReconcileBankTransactionData): Promise<BankTransactionReconciliationResult> { void clinicId; void data; throw unavailable() }
}

function unavailable(): ReconciliationRepositoryError {
  return new ReconciliationRepositoryError('unavailable', 'conciliação indisponível no modo demo')
}
