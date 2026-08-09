export const BANK_DIRECTIONS = ['credit', 'debit'] as const
export type BankDirection = (typeof BANK_DIRECTIONS)[number]

export const BANK_TRANSACTION_STATUSES = ['pending', 'reconciled', 'ignored'] as const
export type BankTransactionStatus = (typeof BANK_TRANSACTION_STATUSES)[number]

export interface BankAccount {
  id: string
  name: string
  bankName: string | null
  lastFour: string | null
  notes: string | null
  isActive: boolean
  updatedAt: Date
}

export interface BankTransactionReconciliation {
  id: string
  invoiceId: string | null
  payableId: string | null
  matchedAmountCents: number
  notes: string | null
}

export interface BankTransaction {
  id: string
  bankAccountId: string
  bankAccountName: string
  occurredOn: Date
  direction: BankDirection
  amountCents: number
  description: string
  externalId: string | null
  status: BankTransactionStatus
  notes: string | null
  reconciliation: BankTransactionReconciliation | null
}

export interface ReconciliationCandidate {
  id: string
  label: string
  amountCents: number
  date: Date
  reference: string | null
}

export interface NewBankAccountData {
  name: string
  bankName: string | null
  lastFour: string | null
  notes: string | null
}

export interface NewBankTransactionData {
  bankAccountId: string
  occurredOn: Date
  direction: BankDirection
  amountCents: number
  description: string
  externalId: string | null
  notes: string | null
}

export interface ReconcileBankTransactionData {
  transactionId: string
  invoiceId: string | null
  payableId: string | null
  notes: string | null
}
