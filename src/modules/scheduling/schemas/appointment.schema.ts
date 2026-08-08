import { z } from 'zod'

export const appointmentMessages = {
  patientRequired: 'Selecione um paciente.',
  professionalRequired: 'Selecione um profissional.',
  typeRequired: 'Informe o tipo de atendimento.',
  dateRequired: 'Escolha uma data.',
  timeRequired: 'Escolha um horário.',
  conflict: 'Este profissional já possui um atendimento nesse horário.',
} as const

/** Valores do enum `appointment_status` do banco que fazem sentido na criacao. */
export const appointmentStatusOptions = [
  { value: 'scheduled', label: 'Aguardando confirmação' },
  { value: 'confirmed', label: 'Confirmado' },
] as const

export const durationOptions = [
  { value: '30', label: '30 minutos' },
  { value: '45', label: '45 minutos' },
  { value: '60', label: '1 hora' },
  { value: '90', label: '1h 30min' },
] as const

export const newAppointmentSchema = z.object({
  patientId: z.string().min(1, appointmentMessages.patientRequired),
  professionalId: z.string().min(1, appointmentMessages.professionalRequired),
  type: z.string().trim().min(1, appointmentMessages.typeRequired),
  date: z.string().min(1, appointmentMessages.dateRequired),
  time: z.string().min(1, appointmentMessages.timeRequired),
  durationMinutes: z.string(),
  status: z.enum(['scheduled', 'confirmed']),
  notes: z.string().optional(),
})

export type NewAppointmentInput = z.infer<typeof newAppointmentSchema>

// ---------------------------------------------------------------------------
// Contrato do servidor (A-01)
// ---------------------------------------------------------------------------

/**
 * Mensagens que só o servidor produz.
 *
 * Nenhuma carrega detalhe de banco (docs/06-acoes-e-auditoria.md §2).
 */
export const scheduleMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  invalidDateTime: 'Informe uma data e um horário válidos.',
  durationInvalid: 'A duração precisa estar entre 5 minutos e 8 horas.',
  tooFarInPast: 'Não é possível agendar tão longe no passado.',
  conflict: 'Este profissional já possui um atendimento nesse horário.',
  forbidden: 'Você não tem permissão para alterar a agenda.',
  notFound: 'Este atendimento não está mais disponível nesta clínica.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível salvar o atendimento agora. Tente novamente.',
  unexpectedCancel:
    'Não foi possível cancelar o atendimento agora. Tente novamente.',
  cancelReasonTooLong: 'O motivo pode ter no máximo 500 caracteres.',
} as const

/** Duração mínima e máxima aceitas — o resto é engano de digitação. */
const MIN_DURATION_MINUTES = 5
const MAX_DURATION_MINUTES = 8 * 60

/**
 * Quanto tempo para trás a agenda aceita.
 *
 * Não é zero: registrar um atendimento que já aconteceu (encaixe anotado depois)
 * é uso legítimo da recepção. Um ano para trás é engano de digitação de ano.
 */
const MAX_DAYS_IN_PAST = 365

/** 'YYYY-MM-DD' + 'HH:mm' -> Date no fuso do servidor, ou null. */
function parseLocalDateTime(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  if (!/^\d{2}:\d{2}$/.test(time)) return null

  const [year, month, day] = date.split('-').map(Number)
  const [hours, minutes] = time.split(':').map(Number)

  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  if (hours > 23 || minutes > 59) return null

  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0)
  if (Number.isNaN(parsed.getTime())) return null

  // O construtor "conserta" 31/02 para 03/03. Comparar de volta recusa a data
  // que não existe no calendário.
  return parsed.getMonth() === month - 1 && parsed.getDate() === day
    ? parsed
    : null
}

/**
 * Contrato de criação, reaplicado no servidor.
 *
 * Três coisas que este schema faz e o do formulário não:
 *
 *  1. **Converte data + hora + duração em `startsAt`/`endsAt`.** O banco guarda
 *     intervalo; duração é forma de exibição. Converter uma vez, aqui, impede
 *     que UI e adapter discordem sobre quando o atendimento termina.
 *  2. **Recusa data de calendário inexistente** (31/02) e duração absurda.
 *  3. **Não aceita `clinicId` nem `createdBy`.** Os dois saem do
 *     `ActionContext`; não há campo por onde o cliente os mandar.
 */
export const createAppointmentSchema = z
  .object({
    patientId: z.uuid(appointmentMessages.patientRequired),
    professionalId: z.uuid(appointmentMessages.professionalRequired),
    type: z
      .string()
      .trim()
      .min(1, appointmentMessages.typeRequired)
      .max(120, scheduleMessages.invalidFields),
    date: z.string(),
    time: z.string(),
    durationMinutes: z.coerce
      .number()
      .int()
      .min(MIN_DURATION_MINUTES, scheduleMessages.durationInvalid)
      .max(MAX_DURATION_MINUTES, scheduleMessages.durationInvalid),
    status: z.enum(['scheduled', 'confirmed']),
    notes: z
      .string()
      .optional()
      .transform((value) => value?.trim() ?? '')
      .transform((value) => (value === '' ? null : value)),
  })
  .transform((value, ctx) => {
    const startsAt = parseLocalDateTime(value.date, value.time)

    if (!startsAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['date'],
        message: scheduleMessages.invalidDateTime,
      })
      return z.NEVER
    }

    const floor = new Date()
    floor.setDate(floor.getDate() - MAX_DAYS_IN_PAST)

    if (startsAt < floor) {
      ctx.addIssue({
        code: 'custom',
        path: ['date'],
        message: scheduleMessages.tooFarInPast,
      })
      return z.NEVER
    }

    return {
      patientId: value.patientId,
      professionalId: value.professionalId,
      reason: value.type,
      status: value.status,
      notes: value.notes,
      startsAt,
      endsAt: new Date(startsAt.getTime() + value.durationMinutes * 60_000),
    }
  })

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>

/**
 * Remarcação: o alvo e o novo horário.
 *
 * `appointmentId` **pode** vir do cliente — é o único identificador que ele tem
 * o direito de escolher, porque diz O QUE remarcar, não ONDE. A clínica continua
 * saindo do `ActionContext`, e o repositório filtra por ela.
 */
export const rescheduleAppointmentSchema = z
  .object({
    appointmentId: z.uuid(scheduleMessages.unexpected),
    date: z.string(),
    time: z.string(),
    durationMinutes: z.coerce
      .number()
      .int()
      .min(MIN_DURATION_MINUTES, scheduleMessages.durationInvalid)
      .max(MAX_DURATION_MINUTES, scheduleMessages.durationInvalid),
  })
  .transform((value, ctx) => {
    const startsAt = parseLocalDateTime(value.date, value.time)

    if (!startsAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['date'],
        message: scheduleMessages.invalidDateTime,
      })
      return z.NEVER
    }

    return {
      appointmentId: value.appointmentId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + value.durationMinutes * 60_000),
    }
  })

export type RescheduleAppointmentInput = z.infer<
  typeof rescheduleAppointmentSchema
>

export const cancelAppointmentSchema = z.object({
  appointmentId: z.uuid(scheduleMessages.unexpected),
  /** Motivo é opcional: quem cancela nem sempre sabe por quê. */
  reason: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? '')
    .refine(
      (value) => value.length <= 500,
      scheduleMessages.cancelReasonTooLong,
    )
    .transform((value) => (value === '' ? null : value)),
})

export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>

/**
 * O que as Server Actions de agenda devolvem ao cliente.
 *
 * Somente escalares: `Date` e linha crua do Supabase não atravessam a fronteira
 * (docs/06-acoes-e-auditoria.md §2). O container remonta o que a tela precisa.
 */
export interface AppointmentDto {
  id: string
  patientId: string
  patientName: string
  professionalId: string
  professionalName: string
  type: string
  /** ISO 8601 completo, em UTC. */
  startsAt: string
  durationMinutes: number
  status: string
  notes?: string
}
