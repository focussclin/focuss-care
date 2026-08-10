import { z } from 'zod'

export const serviceMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  nameRequired: 'Informe o nome do serviço.',
  nameTooLong: 'Use no máximo 160 caracteres.',
  codeTooLong: 'Use no máximo 40 caracteres no código.',
  tussTooLong: 'Use no máximo 20 caracteres no código TUSS.',
  categoryTooLong: 'Use no máximo 80 caracteres na categoria.',
  descriptionTooLong: 'Use no máximo 500 caracteres na descrição.',
  durationInvalid: 'A duração deve ser um inteiro de 5 a 480 minutos.',
  priceInvalid: 'O preço deve ser um valor inteiro em centavos, de 0 a 20 milhões.',
  duplicateCode:
    'Já existe um serviço com este código. Códigos repetidos deixam quem fatura sem saber qual valor vale.',
  forbidden: 'Você não tem permissão para gerenciar o catálogo desta clínica.',
  notFound: 'Este serviço não está mais disponível nesta clínica.',
  writeForbidden:
    'O catálogo foi carregado, mas o banco recusou a gravação. Falta policy de escrita em `services` para este papel.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a ação agora. Tente novamente.',
} as const

const optionalText = (max: number, message: string) =>
  z
    .union([z.literal(''), z.string().trim().max(max, message)])
    .transform((value) => value || null)

/**
 * Duração de 5 a 480 minutos.
 *
 * Menos de cinco minutos não é atendimento agendável, e mais de oito horas
 * ultrapassa qualquer expediente — os dois extremos são erro de digitação, e
 * aceitar um deles enche a agenda de blocos impossíveis.
 */
const duration = z
  .union([
    z.literal(''),
    z.coerce
      .number()
      .int(serviceMessages.durationInvalid)
      .min(5, serviceMessages.durationInvalid)
      .max(480, serviceMessages.durationInvalid),
  ])
  .transform((value) => (value === '' ? null : value))

const serviceShape = {
  name: z
    .string()
    .trim()
    .min(2, serviceMessages.nameRequired)
    .max(160, serviceMessages.nameTooLong),
  /*
   * Código sobe em MAIÚSCULAS.
   *
   * É ele que liga o serviço ao que o convênio e o financeiro entendem, e
   * "cons01" e "CONS01" seriam dois serviços distintos para o banco e o mesmo
   * para quem lê. Normalizar na entrada evita a duplicata antes de ela existir.
   */
  code: optionalText(40, serviceMessages.codeTooLong).transform((value) =>
    value ? value.toLocaleUpperCase('pt-BR') : null,
  ),
  tussCode: optionalText(20, serviceMessages.tussTooLong),
  category: optionalText(80, serviceMessages.categoryTooLong),
  description: optionalText(500, serviceMessages.descriptionTooLong),
  defaultDurationMinutes: duration,
  defaultPriceCents: z
    .number()
    .int(serviceMessages.priceInvalid)
    .min(0, serviceMessages.priceInvalid)
    .max(2_000_000_000, serviceMessages.priceInvalid),
  requiresAuthorization: z.boolean(),
}

export const createServiceSchema = z.object(serviceShape)
export type CreateServiceInput = z.infer<typeof createServiceSchema>

export const updateServiceSchema = z.object({
  serviceId: z.uuid(serviceMessages.notFound),
  ...serviceShape,
})
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>

export const setServiceActiveSchema = z.object({
  serviceId: z.uuid(serviceMessages.notFound),
  isActive: z.boolean(),
})
export type SetServiceActiveInput = z.infer<typeof setServiceActiveSchema>

export const deleteServiceSchema = z.object({
  serviceId: z.uuid(serviceMessages.notFound),
})
export type DeleteServiceInput = z.infer<typeof deleteServiceSchema>

export interface ServiceDto {
  id: string
  code: string | null
  tussCode: string | null
  name: string
  description: string | null
  category: string | null
  defaultDurationMinutes: number | null
  /**
   * `null` quando quem olha não tem `invoice.read`.
   *
   * A matriz é explícita: "receptionist não vê valor nenhum — marcar consulta
   * não exige saber quanto ela custa". O preço é omitido no SERVIDOR, e não
   * escondido no CSS: o que não pode ser visto não atravessa a fronteira.
   */
  defaultPriceCents: number | null
  requiresAuthorization: boolean
  isActive: boolean
}

export interface ServiceFormValues {
  name: string
  code: string
  tussCode: string
  category: string
  description: string
  defaultDurationMinutes: string
  defaultPriceCents: number
  requiresAuthorization: boolean
}
