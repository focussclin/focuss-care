import { z } from 'zod'

import {
  BANK_DIRECTIONS,
  BANK_TRANSACTION_STATUSES,
  type BankDirection,
} from '../domain/Reconciliation'

export type { BankDirection, BankTransactionStatus } from '../domain/Reconciliation'

export const reconciliationMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  accountNameRequired: 'Informe o nome da conta.',
  accountNameTooLong: 'Use no máximo 120 caracteres.',
  bankNameTooLong: 'Use no máximo 80 caracteres.',
  lastFourInvalid: 'Informe até quatro dígitos finais.',
  notesTooLong: 'Use no máximo 500 caracteres.',
  accountInvalid: 'Escolha uma conta bancária ativa.',
  dateInvalid: 'Informe uma data válida.',
  directionInvalid: 'Escolha entrada ou saída.',
  amountInvalid: 'Informe um valor maior que zero em centavos.',
  descriptionRequired: 'Informe a descrição da transação.',
  descriptionTooLong: 'Use no máximo 240 caracteres.',
  externalIdTooLong: 'Use no máximo 120 caracteres.',
  transactionInvalid: 'Escolha uma transação pendente.',
  targetRequired: 'Escolha uma fatura ou uma despesa para conciliar.',
  targetConflict: 'Escolha somente uma fatura ou uma despesa.',
  targetNotesTooLong: 'Use no máximo 500 caracteres.',
  alreadyProcessed: 'Esta transação já foi conciliada ou ignorada. Atualize a página para ver o estado atual.',
  directionMismatch: 'Entrada só concilia com fatura, e saída só com despesa. Recarregue a lista e tente novamente.',
  statusTransitionInvalid: 'Só uma transação pendente pode ser ignorada, e só uma ignorada pode voltar para a fila.',
  divergenceWarning: 'O valor da transação difere do registro escolhido. O vínculo grava o valor CHEIO da transação e não pode ser desfeito.',
  forbidden: 'Você não tem permissão para gerenciar a conciliação nesta clínica.',
  notFound: 'Este registro não está mais disponível nesta clínica.',
  duplicate: 'Esta transação já foi importada ou esta conta já existe.',
  schemaPending:
    'A conciliação ainda está sendo preparada no banco. Aplique a migration indicada e tente novamente.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a ação agora. Tente novamente.',
} as const

function optionalText(max: number, message: string) {
  return z
    .union([z.literal(''), z.null(), z.string().trim().max(max, message)])
    .transform((value) => (typeof value === 'string' && value ? value : null))
}

function calendarDate() {
  return z
    .union([z.literal(''), z.iso.date(reconciliationMessages.dateInvalid)])
    .transform((value, context) => {
      if (!value) {
        context.addIssue({ code: 'custom', message: reconciliationMessages.dateInvalid })
        return z.NEVER
      }
      const result = new Date(`${value}T12:00:00`)
      if (Number.isNaN(result.getTime())) {
        context.addIssue({ code: 'custom', message: reconciliationMessages.dateInvalid })
        return z.NEVER
      }
      return result
    })
}

export const createBankAccountSchema = z.object({
  name: z.string().trim().min(2, reconciliationMessages.accountNameRequired).max(120, reconciliationMessages.accountNameTooLong),
  bankName: optionalText(80, reconciliationMessages.bankNameTooLong),
  lastFour: z.string().trim().regex(/^\d{0,4}$/, reconciliationMessages.lastFourInvalid),
  notes: optionalText(500, reconciliationMessages.notesTooLong),
})
export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>

export const toggleBankAccountSchema = z.object({
  accountId: z.uuid(reconciliationMessages.notFound),
  isActive: z.boolean(),
})
export type ToggleBankAccountInput = z.infer<typeof toggleBankAccountSchema>

export const createBankTransactionSchema = z.object({
  bankAccountId: z.uuid(reconciliationMessages.accountInvalid),
  occurredOn: calendarDate(),
  direction: z.enum(BANK_DIRECTIONS, reconciliationMessages.directionInvalid),
  amountCents: z.number().int(reconciliationMessages.amountInvalid).min(1, reconciliationMessages.amountInvalid).max(2_000_000_000, reconciliationMessages.amountInvalid),
  description: z.string().trim().min(2, reconciliationMessages.descriptionRequired).max(240, reconciliationMessages.descriptionTooLong),
  externalId: optionalText(120, reconciliationMessages.externalIdTooLong),
  notes: optionalText(500, reconciliationMessages.notesTooLong),
})
export type CreateBankTransactionInput = z.infer<typeof createBankTransactionSchema>

export const reconcileBankTransactionSchema = z
  .object({
    transactionId: z.uuid(reconciliationMessages.transactionInvalid),
    invoiceId: z.union([z.literal(''), z.null(), z.uuid(reconciliationMessages.notFound)]).transform((value) => value || null),
    payableId: z.union([z.literal(''), z.null(), z.uuid(reconciliationMessages.notFound)]).transform((value) => value || null),
    notes: optionalText(500, reconciliationMessages.targetNotesTooLong),
  })
  .superRefine((value, context) => {
    if ((value.invoiceId === null) === (value.payableId === null)) {
      context.addIssue({ code: 'custom', path: ['invoiceId'], message: value.invoiceId === null ? reconciliationMessages.targetRequired : reconciliationMessages.targetConflict })
    }
  })
export type ReconcileBankTransactionInput = z.infer<typeof reconcileBankTransactionSchema>

/**
 * `from` viaja junto de propósito.
 *
 * Ele não é o estado que a action vai gravar — é o estado que a TELA VIU, e vai
 * para o `WHERE` do UPDATE. Sem ele, clicar "Ignorar" numa linha que outra
 * pessoa acabou de conciliar rebaixaria o status e deixaria a evidência de pé,
 * apontando para uma transação que afirma não ter sido conciliada.
 */
export const setBankTransactionStatusSchema = z.object({
  transactionId: z.uuid(reconciliationMessages.transactionInvalid),
  from: z.enum(BANK_TRANSACTION_STATUSES, reconciliationMessages.statusTransitionInvalid),
  to: z.enum(BANK_TRANSACTION_STATUSES, reconciliationMessages.statusTransitionInvalid),
})
export type SetBankTransactionStatusInput = z.infer<typeof setBankTransactionStatusSchema>

export interface BankAccountDto {
  id: string
  name: string
  bankName: string | null
  lastFour: string | null
  notes: string | null
  isActive: boolean
  updatedAt: string
}

export interface BankTransactionReconciliationDto {
  id: string
  invoiceId: string | null
  payableId: string | null
  matchedAmountCents: number
  notes: string | null
}

export interface BankTransactionDto {
  id: string
  bankAccountId: string
  bankAccountName: string
  occurredOn: string
  direction: BankDirection
  amountCents: number
  description: string
  externalId: string | null
  status: 'pending' | 'reconciled' | 'ignored'
  notes: string | null
  reconciliation: BankTransactionReconciliationDto | null
}

export interface ReconciliationCandidateDto {
  id: string
  label: string
  amountCents: number
  date: string
  reference: string | null
}

export interface BankReconciliationDto {
  id: string
  transactionId: string
  invoiceId: string | null
  payableId: string | null
  matchedAmountCents: number
}

export interface BankAccountFormValues {
  name: string
  bankName: string
  lastFour: string
  notes: string
}

export interface BankTransactionFormValues {
  bankAccountId: string
  occurredOn: string
  direction: BankDirection
  amountCents: number | null
  description: string
  externalId: string
  notes: string
}

export interface ReconcileFormValues {
  transactionId: string
  invoiceId: string | null
  payableId: string | null
  notes: string
}
