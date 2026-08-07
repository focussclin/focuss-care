import { z } from 'zod'

export const patientMessages = {
  nameRequired: 'Informe o nome completo.',
  phoneRequired: 'Informe um telefone para contato.',
  invalidEmail: 'Digite um e-mail válido.',
} as const

export const contactPreferenceOptions = [
  { value: 'WhatsApp', label: 'WhatsApp' },
  { value: 'Telefone', label: 'Telefone' },
  { value: 'E-mail', label: 'E-mail' },
] as const

export const newPatientSchema = z.object({
  name: z.string().trim().min(1, patientMessages.nameRequired),
  email: z
    .string()
    .trim()
    .email(patientMessages.invalidEmail)
    .or(z.literal(''))
    .optional(),
  phone: z.string().trim().min(1, patientMessages.phoneRequired),
  birthDate: z.string().optional(),
  contactPreference: z.enum(['WhatsApp', 'Telefone', 'E-mail']),
  notes: z.string().optional(),
})

export type NewPatientInput = z.infer<typeof newPatientSchema>

/** Filtros da listagem (PATIENTS_DESIGN.md, secao "Busca e filtros"). */
export const statusFilterOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
] as const

export const lastVisitFilterOptions = [
  { value: 'any', label: 'Qualquer período' },
  { value: 'last-30', label: 'Últimos 30 dias' },
  { value: 'over-90', label: 'Mais de 90 dias' },
] as const

export type StatusFilter = (typeof statusFilterOptions)[number]['value']
export type LastVisitFilter = (typeof lastVisitFilterOptions)[number]['value']
