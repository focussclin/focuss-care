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

/**
 * O que a tela pode trocar à mão: só `pending` ↔ `ignored`.
 *
 * `reconciled` não entra nem como origem nem como destino. Ele é consequência
 * de `reconcile_bank_transaction`, que grava o vínculo e muda o status na mesma
 * transação — escolhê-lo num menu diria que a transação foi casada com alguma
 * coisa sem que exista linha nenhuma em `bank_reconciliations`. E ignorar uma
 * já conciliada deixaria a evidência de pé apontando para uma transação que
 * afirma não ter sido conciliada.
 */
export const MANUAL_STATUS_TRANSITIONS: Record<
  BankTransactionStatus,
  readonly BankTransactionStatus[]
> = {
  pending: ['ignored'],
  ignored: ['pending'],
  reconciled: [],
}

export function canChangeStatusManually(
  from: BankTransactionStatus,
  to: BankTransactionStatus,
): boolean {
  return MANUAL_STATUS_TRANSITIONS[from].includes(to)
}

/**
 * A diferença entre o que o banco moveu e o que o registro interno diz.
 *
 * `reconcile_bank_transaction` grava `matched_amount_cents` com o valor CHEIO
 * da transação — nunca com o valor da fatura. Casar uma entrada de R$ 500 com
 * uma fatura de R$ 450 é aceito pelo banco em silêncio, e o vínculo não tem
 * UPDATE nem DELETE: a evidência errada fica.
 *
 * O schema não tem status `divergente`, e inventar um seria mentir sobre o que
 * está gravado. A divergência é derivada — dos dois valores reais, na hora de
 * decidir — e serve para avisar antes do vínculo, não depois.
 */
export function divergenceCents(
  transactionAmountCents: number,
  targetAmountCents: number,
): number {
  return transactionAmountCents - targetAmountCents
}

export function hasDivergence(
  transactionAmountCents: number,
  targetAmountCents: number,
): boolean {
  return divergenceCents(transactionAmountCents, targetAmountCents) !== 0
}

/** O sentido do dinheiro decide o que pode ser casado — a regra é do banco. */
export function targetKindFor(direction: BankDirection): 'invoice' | 'payable' {
  return direction === 'credit' ? 'invoice' : 'payable'
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
