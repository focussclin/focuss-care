import { z } from 'zod'

import {
  businessDaySchema,
  weekdayLabels,
  type Weekday,
} from '@/lib/clinic/business-hours'

export const settingsMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  tradeNameRequired: 'Informe o nome da clínica.',
  tradeNameTooShort: 'O nome precisa ter pelo menos 2 caracteres.',
  tradeNameTooLong: 'O nome pode ter no máximo 120 caracteres.',
  tradeNameInvalid: 'Use letras e números no nome da clínica.',
  legalNameTooLong: 'A razão social pode ter no máximo 160 caracteres.',
  legalNameInvalid: 'Use letras e números na razão social.',
  /**
   * Recusa de CNPJ inválido.
   *
   * A mensagem cita os dígitos verificadores porque o erro mais comum é digitar
   * um número a menos — e "CNPJ inválido" sozinho faz a pessoa conferir a
   * empresa em vez de conferir a digitação.
   */
  cnpjInvalid: 'CNPJ inválido. Confira os 14 dígitos.',
  cnpjTaken: 'Este CNPJ já está cadastrado em outra clínica.',
  durationInvalid: 'Escolha uma das durações disponíveis.',
  hoursIncomplete: 'Informe os sete dias da semana.',
  notFound: 'Esta clínica não está mais disponível.',
  forbidden: 'Você não tem permissão para alterar as configurações da clínica.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível salvar as configurações agora. Tente novamente.',
  /**
   * Aviso de horário salvo em formato desconhecido.
   *
   * Aparece ANTES de a pessoa poder salvar. Sem ele, o primeiro clique em
   * "Salvar" apagaria uma configuração que nunca chegou a aparecer na tela.
   */
  hoursUnrecognized:
    'Há um horário de funcionamento salvo em um formato que esta tela não reconhece. Os valores abaixo são os padrões — salvar vai substituir o que está no banco.',
} as const

/*
 * `weekdayLabels`, `WEEKDAYS` e o formato do dia vêm de `lib/clinic`: a agenda
 * (A-02) nomeia os mesmos dias ao recusar um horário fora do expediente, e duas
 * listas separadas divergiriam na primeira mudança.
 */
export { WEEKDAYS, weekdayLabels } from '@/lib/clinic/business-hours'

/**
 * Durações que a tela oferece.
 *
 * **Precisa continuar espelhando `durationOptions` do módulo `scheduling`.** A
 * lista é redigitada aqui, e não importada, porque a regra 4 da arquitetura
 * proíbe um módulo de alcançar o interior de outro (F-03) — e a alternativa,
 * promover a lista a `_shared`, colocaria uma decisão da agenda num lugar onde
 * ninguém a encontraria. O formulário de agendamento tolera divergência: valor
 * configurado que não esteja entre as opções cai no primeiro da lista dele.
 */
export const durationChoices = [
  { value: 30, label: '30 minutos' },
  { value: 45, label: '45 minutos' },
  { value: 60, label: '1 hora' },
  { value: 90, label: '1h 30min' },
] as const

const durationValues = durationChoices.map((choice) => choice.value)

/** O nome precisa ter ao menos um caractere alfanumérico de verdade. */
const ALPHANUMERIC = /[\p{L}\p{N}]/u

/** Caracteres de controle não entram em campo que vira dado de tenant. */
const CONTROL_CHARS = /\p{C}/u

/*
 * `tradeNameSchema` do módulo `identity` valida exatamente isto e não é
 * reaproveitado aqui: importá-lo violaria a regra 4 (um módulo não alcança o
 * interior de outro). A duplicação é o preço da fronteira, e é pequena — as duas
 * cópias descrevem a mesma coluna, `clinics.trade_name`.
 */
const tradeNameSchema = z
  .string()
  .trim()
  .min(1, settingsMessages.tradeNameRequired)
  .min(2, settingsMessages.tradeNameTooShort)
  .max(120, settingsMessages.tradeNameTooLong)
  .refine((value) => ALPHANUMERIC.test(value), settingsMessages.tradeNameInvalid)
  .refine(
    (value) => !CONTROL_CHARS.test(value),
    settingsMessages.tradeNameInvalid,
  )

/** Campo opcional: string vazia é "não informado", não erro. */
const legalNameSchema = z
  .string()
  .trim()
  .max(160, settingsMessages.legalNameTooLong)
  .refine(
    (value) => value === '' || ALPHANUMERIC.test(value),
    settingsMessages.legalNameInvalid,
  )
  .refine(
    (value) => !CONTROL_CHARS.test(value),
    settingsMessages.legalNameInvalid,
  )
  .transform((value) => (value === '' ? null : value))

/**
 * Confere os dois dígitos verificadores do CNPJ.
 *
 * Vale a pena validar de verdade, e não só contar 14 dígitos, porque o destino
 * deste número é a nota fiscal e a fatura (B-01): um CNPJ com dígito errado só
 * é recusado lá na frente, pela prefeitura ou pelo convênio, quando corrigi-lo
 * já custa retrabalho.
 */
export function isValidCnpj(digits: string): boolean {
  if (!/^\d{14}$/.test(digits)) return false

  // 00000000000000 e afins passam no cálculo dos dígitos e não são CNPJ.
  if (/^(\d)\1{13}$/.test(digits)) return false

  const checkDigit = (length: number): number => {
    let weight = length - 7
    let sum = 0

    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * weight
      weight -= 1
      if (weight < 2) weight = 9
    }

    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }

  return (
    checkDigit(12) === Number(digits[12]) && checkDigit(13) === Number(digits[13])
  )
}

/**
 * CNPJ guardado como 14 dígitos, sem pontuação.
 *
 * Normalizar na entrada é o que permite comparar e buscar depois: '11.222.333/
 * 0001-81' e '11222333000181' são o mesmo cadastro, e guardar os dois formatos
 * transformaria uma checagem de duplicidade em coincidência de digitação.
 */
const cnpjSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ''))
  .refine(
    (digits) => digits === '' || isValidCnpj(digits),
    settingsMessages.cnpjInvalid,
  )
  .transform((digits) => (digits === '' ? null : digits))

export const updateClinicProfileSchema = z.object({
  tradeName: tradeNameSchema,
  legalName: legalNameSchema,
  cnpj: cnpjSchema,
})

export type UpdateClinicProfileInput = z.infer<typeof updateClinicProfileSchema>

/**
 * A semana inteira, sempre.
 *
 * O `superRefine` faz duas checagens que o formato sozinho não faz: que os sete
 * dias estão presentes uma vez cada, e que dia aberto fecha depois de abrir.
 *
 * A mensagem NOMEIA o dia ("Sábado: ...") porque `createAction` só consegue
 * associar o erro ao primeiro segmento do caminho — aqui, `days`. Sem o nome no
 * texto, a tela diria "revise os campos" sobre um formulário de sete linhas.
 */
export const updateBusinessHoursSchema = z.object({
  days: z
    .array(businessDaySchema)
    .length(7, settingsMessages.hoursIncomplete)
    .superRefine((days, ctx) => {
      const seen = new Set<number>()

      for (const day of days) {
        if (seen.has(day.weekday)) {
          ctx.addIssue({
            code: 'custom',
            message: settingsMessages.hoursIncomplete,
          })
          return
        }
        seen.add(day.weekday)

        if (!day.closed && day.opensAt >= day.closesAt) {
          ctx.addIssue({
            code: 'custom',
            message: `${weekdayLabels[day.weekday]}: o horário de fechamento precisa ser depois do de abertura.`,
          })
        }
      }

      if (seen.size !== 7) {
        ctx.addIssue({
          code: 'custom',
          message: settingsMessages.hoursIncomplete,
        })
      }
    }),
})

export type UpdateBusinessHoursInput = z.infer<typeof updateBusinessHoursSchema>

export const updateAppointmentDefaultsSchema = z.object({
  durationMinutes: z.coerce
    .number()
    .refine(
      (value) => durationValues.includes(value as (typeof durationValues)[number]),
      settingsMessages.durationInvalid,
    ),
})

export type UpdateAppointmentDefaultsInput = z.infer<
  typeof updateAppointmentDefaultsSchema
>

export const storedAppointmentDefaultsSchema = z.object({
  durationMinutes: z.number().int().positive(),
})

// ---------------------------------------------------------------------------
// O que atravessa a fronteira da Server Action
// ---------------------------------------------------------------------------

export interface ClinicProfileDto {
  slug: string
  tradeName: string
  legalName: string | null
  /** 14 dígitos sem pontuação, ou null. A tela formata para exibir. */
  cnpj: string | null
  timezone: string
  locale: string
}

export interface BusinessDayDto {
  weekday: Weekday
  closed: boolean
  opensAt: string
  closesAt: string
}

export interface ClinicSettingsDto {
  profile: ClinicProfileDto
  days: readonly BusinessDayDto[]
  hoursSource: 'stored' | 'default' | 'unrecognized'
  durationMinutes: number
}

/** '11222333000181' -> '11.222.333/0001-81'. Entrada fora do formato volta como veio. */
export function formatCnpj(digits: string | null): string {
  if (!digits || !/^\d{14}$/.test(digits)) return digits ?? ''

  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}
