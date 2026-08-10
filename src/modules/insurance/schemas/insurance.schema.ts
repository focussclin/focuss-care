import { z } from 'zod'

import { parseCents } from '@/lib/utils/money'

export const insuranceMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  nameRequired: 'Informe o nome da operadora.',
  planNameRequired: 'Informe o nome do plano.',
  providerRequired: 'Selecione a operadora deste plano.',
  cardRequired: 'Selecione a carteirinha do paciente.',
  patientRequired: 'Selecione o paciente da carteirinha.',
  planRequired: 'Selecione um plano ativo.',
  cardNumberRequired: 'Informe o número da carteirinha.',
  cardNumberTooLong: 'O número da carteirinha pode ter no máximo 80 caracteres.',
  holderNameTooLong: 'O nome do titular pode ter no máximo 160 caracteres.',
  dateInvalid: 'Informe uma data de validade válida.',
  procedureRequired: 'Inclua pelo menos um procedimento na guia.',
  procedureDescription: 'Descreva o procedimento solicitado.',
  quantityInvalid: 'A quantidade precisa ser um número inteiro de 1 a 99.',
  amountInvalid: 'Informe um valor válido, como 50,00.',
  termInvalid: 'O prazo precisa estar entre 1 e 365 dias.',
  authorizationNumberRequired:
    'Informe o número que a operadora devolveu ao autorizar.',
  denialReasonRequired:
    'Transcreva o motivo informado pela operadora. É ele que sustenta o recurso.',
  /**
   * Recusa de reescrever guia já respondida.
   *
   * Não é erro: é o sistema preservando o motivo da negativa, que é o texto
   * usado para recorrer.
   */
  alreadyAnswered:
    'Esta guia já foi respondida. Abra uma nova solicitação em vez de sobrescrever a resposta anterior.',
  duplicate: 'Já existe uma operadora com estes dados nesta clínica.',
  notFound: 'Este registro não está mais disponível nesta clínica.',
  forbidden: 'Você não tem permissão para gerenciar convênios.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a operação agora. Tente novamente.',
  /** Explica a diferença entre glosa e negativa de autorização prévia. */
  glossUnavailable:
    'Glosa é a recusa de pagamento depois da fatura enviada. Ela fica separada da guia negada, que é a operadora recusando a autorização antes do atendimento.',
  claimReasonRequired: 'Descreva o motivo informado pela operadora.',
  claimRecoveredAmountRequired: 'Informe quanto foi recuperado no recurso.',
  claimAlreadyResolved: 'Esta glosa já foi encerrada e não pode ser alterada.',
  claimInvalidTransition:
    'Este status não é válido para o estado atual da glosa.',
  claimAmountTooHigh: 'O valor glosado não pode superar o valor da fatura.',
  claimRecoveryTooHigh:
    'O valor recuperado não pode superar o valor originalmente glosado.',
  /** Texto sobre elegibilidade, exibido junto às carteirinhas. */
  eligibilityUnavailable:
    'A validade abaixo é a que a clínica cadastrou. O sistema não consulta a operadora para confirmar elegibilidade.',
} as const

export const authorizationStatusLabels: Record<string, string> = {
  requested: 'Aguardando operadora',
  approved: 'Autorizada',
  denied: 'Negada',
  canceled: 'Cancelada',
}

/** Texto de dinheiro -> centavos, no servidor. Ver `billing.schema` para o porquê. */
function moneyField(options: { min?: number } = {}) {
  return z.string().transform((value, ctx) => {
    const cents = parseCents(value)

    if (cents === null || cents < (options.min ?? 0)) {
      ctx.addIssue({ code: 'custom', message: insuranceMessages.amountInvalid })
      return z.NEVER
    }

    return cents
  })
}

const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? '')
    .transform((value) => (value === '' ? null : value))
    .refine(
      (value) => value === null || value.length <= max,
      insuranceMessages.invalidFields,
    )

export const createProviderSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, insuranceMessages.nameRequired)
    .max(120, insuranceMessages.invalidFields),
  ansCode: optionalText(20),
  cnpj: optionalText(20),
  notes: optionalText(300),
})

export type CreateProviderInput = z.infer<typeof createProviderSchema>

export const setProviderActiveSchema = z.object({
  providerId: z.uuid(insuranceMessages.unexpected),
  isActive: z.boolean(),
})

export type SetProviderActiveInput = z.infer<typeof setProviderActiveSchema>

export const createPlanSchema = z.object({
  providerId: z.uuid(insuranceMessages.providerRequired),
  name: z
    .string()
    .trim()
    .min(1, insuranceMessages.planNameRequired)
    .max(120, insuranceMessages.invalidFields),
  planCode: optionalText(40),
  copay: moneyField(),
  paymentTermDays: z.coerce
    .number()
    .int(insuranceMessages.termInvalid)
    .min(1, insuranceMessages.termInvalid)
    .max(365, insuranceMessages.termInvalid),
})

export type CreatePlanInput = z.infer<typeof createPlanSchema>

const procedureSchema = z.object({
  code: z
    .string()
    .trim()
    .max(20, insuranceMessages.invalidFields)
    .transform((value) => value),
  description: z
    .string()
    .trim()
    .min(1, insuranceMessages.procedureDescription)
    .max(200, insuranceMessages.invalidFields),
  quantity: z.coerce
    .number()
    .int(insuranceMessages.quantityInvalid)
    .min(1, insuranceMessages.quantityInvalid)
    .max(99, insuranceMessages.quantityInvalid),
})

export const createAuthorizationSchema = z.object({
  patientInsuranceId: z.uuid(insuranceMessages.cardRequired),
  procedures: z
    .array(procedureSchema)
    .min(1, insuranceMessages.procedureRequired),
  notes: optionalText(300),
})

export type CreateAuthorizationInput = z.infer<
  typeof createAuthorizationSchema
>

function validDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.toISOString().slice(0, 10) === value
}

export const createPatientInsuranceSchema = z.object({
  patientId: z.uuid(insuranceMessages.patientRequired),
  planId: z.uuid(insuranceMessages.planRequired),
  cardNumber: z
    .string()
    .trim()
    .min(1, insuranceMessages.cardNumberRequired)
    .max(80, insuranceMessages.cardNumberTooLong),
  holderName: optionalText(160),
  validUntil: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || validDateOnly(value),
      insuranceMessages.dateInvalid,
    )
    .transform((value) => (value === '' ? null : value)),
  isPrimary: z.boolean(),
})

export type CreatePatientInsuranceInput = z.infer<
  typeof createPatientInsuranceSchema
>

export const setPatientInsuranceActiveSchema = z.object({
  insuranceId: z.uuid(insuranceMessages.unexpected),
  isActive: z.boolean(),
})

export type SetPatientInsuranceActiveInput = z.infer<
  typeof setPatientInsuranceActiveSchema
>

/**
 * A resposta da operadora.
 *
 * União discriminada, e não campos opcionais: aprovar EXIGE número, negar EXIGE
 * motivo. Um schema com os dois opcionais aceitaria uma aprovação sem número —
 * que o faturamento rejeita depois, quando o atendimento já aconteceu.
 */
export const answerAuthorizationSchema = z.discriminatedUnion('outcome', [
  z.object({
    authorizationId: z.uuid(insuranceMessages.unexpected),
    outcome: z.literal('approved'),
    authorizationNumber: z
      .string()
      .trim()
      .min(1, insuranceMessages.authorizationNumberRequired)
      .max(60, insuranceMessages.invalidFields),
    expiresAt: z.string().optional(),
  }),
  z.object({
    authorizationId: z.uuid(insuranceMessages.unexpected),
    outcome: z.literal('denied'),
    denialReason: z
      .string()
      .trim()
      .min(1, insuranceMessages.denialReasonRequired)
      .max(500, insuranceMessages.invalidFields),
  }),
])

export type AnswerAuthorizationInput = z.infer<
  typeof answerAuthorizationSchema
>

const claimDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, insuranceMessages.invalidFields)
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    )
  }, insuranceMessages.invalidFields)

export const createClaimDenialSchema = z.object({
  invoiceId: z.uuid(insuranceMessages.unexpected),
  denialCode: optionalText(30),
  reason: z
    .string()
    .trim()
    .min(1, insuranceMessages.claimReasonRequired)
    .max(500, insuranceMessages.invalidFields),
  amount: moneyField({ min: 1 }),
  deniedAt: claimDate,
  notes: optionalText(500),
})

export type CreateClaimDenialInput = z.infer<typeof createClaimDenialSchema>

export const updateClaimDenialSchema = z.discriminatedUnion('status', [
  z.object({
    denialId: z.uuid(insuranceMessages.unexpected),
    status: z.literal('appealing'),
    notes: optionalText(500),
  }),
  z.object({
    denialId: z.uuid(insuranceMessages.unexpected),
    status: z.literal('recovered'),
    recoveredAmount: moneyField({ min: 1 }),
    notes: optionalText(500),
  }),
  z.object({
    denialId: z.uuid(insuranceMessages.unexpected),
    status: z.literal('accepted'),
    notes: optionalText(500),
  }),
])

export type UpdateClaimDenialInput = z.infer<typeof updateClaimDenialSchema>

/**
 * O formato guardado em `insurance_authorizations.procedures`.
 *
 * É o mesmo schema do formulário, sem as mensagens: coluna `jsonb` não tem forma
 * garantida pelo banco, e a única defesa contra o que está lá dentro é reler com
 * o contrato com que se escreveu.
 */
export const storedProceduresSchema = z.array(
  z.object({
    code: z.string(),
    description: z.string(),
    quantity: z.number().int().positive(),
  }),
)

// ---------------------------------------------------------------------------
// O que atravessa a fronteira da Server Action
// ---------------------------------------------------------------------------

export interface ProviderDto {
  id: string
  name: string
  ansCode: string | null
  isActive: boolean
  activePlans: number
}

export interface PlanDto {
  id: string
  providerName: string
  name: string
  planCode: string | null
  copayCents: number
  paymentTermDays: number
  isActive: boolean
}

export interface AuthorizationDto {
  id: string
  patientName: string
  planName: string
  providerName: string
  authorizationNumber: string | null
  status: string
  procedures: readonly { code: string; description: string; quantity: number }[]
  requestedAt: string
  expiresAt: string | null
  denialReason: string | null
}

export interface PatientInsuranceDto {
  id: string
  label: string
  /** ISO, ou null. A tela avisa quando está vencida. */
  validUntil: string | null
}

export interface PatientInsuranceRecordDto {
  id: string
  patientId: string
  patientName: string
  planId: string
  planName: string
  providerName: string
  cardNumber: string
  holderName: string | null
  validUntil: string | null
  isPrimary: boolean
  isActive: boolean
}

export interface InsuranceSummaryDto {
  activeProviders: number
  activePlans: number
  pendingAuthorizations: number
  deniedAuthorizations: number
}

export interface ClaimDenialDto {
  id: string
  invoiceId: string
  invoiceNumber: number | null
  patientName: string
  planName: string
  invoiceItemDescription: string | null
  denialCode: string | null
  reason: string
  amountCents: number
  status: string
  deniedAt: string
  appealedAt: string | null
  resolvedAt: string | null
  recoveredCents: number | null
  notes: string | null
}

export interface ClaimInvoiceOptionDto {
  id: string
  label: string
}

export const claimDenialStatusLabels: Record<string, string> = {
  received: 'Recebida',
  appealing: 'Em recurso',
  recovered: 'Recuperada',
  accepted: 'Prejuízo aceito',
}
