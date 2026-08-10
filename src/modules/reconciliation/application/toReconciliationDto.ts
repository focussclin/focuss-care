import type { BankAccountDto, BankTransactionDto, ReconciliationCandidateDto } from '../schemas/reconciliation.schema'
import type { BankAccount, BankTransaction, ReconciliationCandidate } from '../domain/Reconciliation'

export function toBankAccountDto(value: BankAccount): BankAccountDto {
  return {
    id: value.id,
    name: value.name,
    bankName: value.bankName,
    lastFour: value.lastFour,
    notes: value.notes,
    isActive: value.isActive,
    updatedAt: value.updatedAt.toISOString(),
  }
}

export function toBankTransactionDto(value: BankTransaction): BankTransactionDto {
  return {
    id: value.id,
    bankAccountId: value.bankAccountId,
    bankAccountName: value.bankAccountName,
    occurredOn: value.occurredOn.toISOString().slice(0, 10),
    direction: value.direction,
    amountCents: value.amountCents,
    description: value.description,
    externalId: value.externalId,
    status: value.status,
    notes: value.notes,
    reconciliation: value.reconciliation,
  }
}

export function toReconciliationCandidateDto(value: ReconciliationCandidate): ReconciliationCandidateDto {
  return {
    id: value.id,
    label: value.label,
    amountCents: value.amountCents,
    date: value.date.toISOString().slice(0, 10),
    reference: value.reference,
  }
}
