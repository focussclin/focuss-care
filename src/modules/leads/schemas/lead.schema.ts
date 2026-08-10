import { z } from 'zod'

import { LEAD_STAGES, type LeadStage } from '../domain/Lead'

export const leadMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  /** Converter cria ficha clínica: quem não cadastra paciente não converte. */
  convertForbidden:
    'Você não tem permissão para cadastrar pacientes nesta clínica.',
  alreadyConverted:
    'Este lead já virou paciente. Abra a ficha dele em Pacientes.',
  convertUnavailable:
    'A conversão cria uma ficha de paciente e exige o banco configurado.',
  nameRequired: 'Informe o nome do lead.',
  nameTooLong: 'Use no máximo 160 caracteres.',
  phoneTooLong: 'Use no máximo 30 caracteres no telefone.',
  emailInvalid: 'Digite um e-mail válido.',
  emailTooLong: 'Use no máximo 254 caracteres no e-mail.',
  sourceTooLong: 'Use no máximo 80 caracteres na origem.',
  campaignTooLong: 'Use no máximo 120 caracteres na campanha.',
  interestTooLong: 'Use no máximo 160 caracteres no interesse.',
  notesTooLong: 'Use no máximo 2000 caracteres nas observações.',
  valueInvalid: 'Informe um valor potencial válido.',
  dateInvalid: 'Informe uma data válida.',
  stageInvalid: 'Escolha uma etapa válida do pipeline.',
  forbidden: 'Você não tem permissão para gerenciar leads nesta clínica.',
  notFound: 'Este lead não está mais disponível nesta clínica.',
  schemaPending:
    'O CRM ainda está sendo preparado no banco. Aplique a migration indicada e tente novamente.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a ação agora. Tente novamente.',
} as const

export const leadStageOptions = [
  { value: 'new', label: 'Novo' },
  { value: 'contacted', label: 'Contatado' },
  { value: 'qualified', label: 'Qualificado' },
  { value: 'scheduled', label: 'Agendamento' },
  { value: 'showed', label: 'Compareceu' },
  { value: 'converted', label: 'Convertido' },
  { value: 'lost', label: 'Perdido' },
] as const satisfies readonly { value: LeadStage; label: string }[]

function calendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const result = new Date(year, month - 1, day, 23, 59, 59, 999)
  return result.getFullYear() === year &&
    result.getMonth() === month - 1 &&
    result.getDate() === day
    ? result
    : null
}

const nextActionAt = z
  .union([z.literal(''), z.null(), z.iso.date(leadMessages.dateInvalid)])
  .transform((value, context) => {
    if (!value) return null
    const date = calendarDate(value)
    if (!date) {
      context.addIssue({ code: 'custom', message: leadMessages.dateInvalid })
      return z.NEVER
    }
    return date
  })

const leadDataShape = {
  name: z
    .string()
    .trim()
    .min(2, leadMessages.nameRequired)
    .max(160, leadMessages.nameTooLong),
  phone: z
    .union([z.literal(''), z.null(), z.string().trim().max(30, leadMessages.phoneTooLong)])
    .transform((value) => (typeof value === 'string' && value ? value : null)),
  email: z
    .union([z.literal(''), z.null(), z.string().trim().max(254, leadMessages.emailTooLong).email(leadMessages.emailInvalid)])
    .transform((value) => (typeof value === 'string' && value ? value.toLowerCase() : null)),
  source: z.string().trim().min(1).max(80, leadMessages.sourceTooLong),
  campaign: z.string().trim().max(120, leadMessages.campaignTooLong).default(''),
  interest: z.string().trim().max(160, leadMessages.interestTooLong).default(''),
  stage: z.enum(LEAD_STAGES, leadMessages.stageInvalid),
  potentialValueCents: z
    .union([
      z.null(),
      z.number().int(leadMessages.valueInvalid).min(0, leadMessages.valueInvalid).max(2_000_000_000, leadMessages.valueInvalid),
    ])
    .default(null),
  nextActionAt,
  notes: z.string().trim().max(2000, leadMessages.notesTooLong).default(''),
  assignedToId: z
    .union([z.literal(''), z.null(), z.uuid(leadMessages.unexpected)])
    .transform((value) => value || null),
}

export const createLeadSchema = z.object(leadDataShape)
export type CreateLeadInput = z.infer<typeof createLeadSchema>

export const updateLeadSchema = z.object({
  leadId: z.uuid(leadMessages.unexpected),
  ...leadDataShape,
})
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>

export const setLeadStageSchema = z.object({
  leadId: z.uuid(leadMessages.unexpected),
  stage: z.enum(LEAD_STAGES, leadMessages.stageInvalid),
})
export type SetLeadStageInput = z.infer<typeof setLeadStageSchema>

/**
 * Conversão em paciente.
 *
 * Só o id do lead. **Nada do paciente vem daqui**: nome, telefone e e-mail
 * saem da linha do lead, dentro da função do banco. Aceitar esses campos na
 * entrada permitiria criar um paciente com dados que nunca estiveram no funil —
 * e a conversão deixaria de ser conversão.
 */
export const convertLeadSchema = z.object({
  leadId: z.uuid(leadMessages.unexpected),
})
export type ConvertLeadInput = z.infer<typeof convertLeadSchema>

export interface LeadDto {
  id: string
  name: string
  phone: string | null
  email: string | null
  source: string
  campaign: string | null
  interest: string | null
  stage: LeadStage
  potentialValueCents: number | null
  nextActionAt: string | null
  notes: string | null
  assignedTo: { id: string; name: string } | null
  convertedPatientId: string | null
  createdAt: string
  updatedAt: string
}

export interface LeadFormValues {
  name: string
  phone: string
  email: string
  source: string
  campaign: string
  interest: string
  stage: LeadStage
  potentialValueCents: number | null
  nextActionAt: string | null
  notes: string
  assignedToId: string | null
}
