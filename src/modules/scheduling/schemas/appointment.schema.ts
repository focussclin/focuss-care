import { z } from 'zod'

import { appointmentStatusMeta } from '@/modules/_shared/domain/types'

import { APPOINTMENT_OUTCOMES } from '../domain/AppointmentLifecycle'

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
  /**
   * Sala do formulário. `''` é "sem sala", e é o padrão.
   *
   * O servidor revalida e normaliza — este schema serve à tela, e a tela pode
   * mandar string vazia porque é o que um `<select>` manda.
   */
  roomId: z.string().optional(),
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
  /**
   * Sala ocupada — e a frase diz o que fazer.
   *
   * Distinta de `conflict` de propósito: aquela manda mudar o horário, esta
   * manda mudar a sala. O horário continua bom, e a recepção não precisa
   * remarcar a consulta inteira.
   */
  roomConflict:
    'Esta sala já está reservada nesse horário. Escolha outra sala — o horário continua disponível.',
  /**
   * Segunda metade da mensagem de horário fora do expediente (A-02).
   *
   * A primeira metade é dinâmica e vem do adapter, com o dia e a janela reais
   * da clínica. Aqui fica só o convite a decidir — e ele **precisa** existir,
   * porque o código devolvido é 'needs-confirmation': sem o caminho de volta, a
   * tela mostraria uma recusa educada para algo que é permitido.
   */
  outsideBusinessHours: 'Deseja agendar mesmo assim?',
  /** Recurso de ultimo caso: `describeBlock` quase sempre tem o que dizer. */
  blockedWindow:
    'Este horario esta bloqueado na agenda. Remova o bloqueio para marcar assim mesmo.',
  forbidden: 'Você não tem permissão para alterar a agenda.',
  notFound: 'Este atendimento não está mais disponível nesta clínica.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível salvar o atendimento agora. Tente novamente.',
  unexpectedCancel:
    'Não foi possível cancelar o atendimento agora. Tente novamente.',
  cancelReasonTooLong: 'O motivo pode ter no máximo 500 caracteres.',

  // -------------------------------------------------------------------------
  // Ciclo de vida do atendimento — feature A-03
  // -------------------------------------------------------------------------

  unexpectedConfirm:
    'Não foi possível confirmar o atendimento agora. Tente novamente.',
  unexpectedOutcome:
    'Não foi possível registrar o desfecho agora. Tente novamente.',
  /**
   * Recusa de desfecho antecipado.
   *
   * Não é permissão: é a diferença entre registrar e prever. Uma falta anotada
   * na véspera entraria na taxa de comparecimento como fato observado.
   */
  outcomeTooEarly:
    'Este atendimento ainda não começou. O desfecho só pode ser registrado a partir do horário marcado.',
  /**
   * Alguém mudou o atendimento antes deste clique.
   *
   * Diz QUAL é o estado atual: "já está confirmado" resolve, "não foi possível"
   * faz clicar de novo. A tradução do enum para o rótulo em pt-BR acontece
   * AQUI, e não em cada action: quatro cópias do mesmo `Record` lookup é como
   * uma delas passa a mostrar `no_show` cru para o usuário.
   */
  staleStatus: (status: string) => {
    const label =
      appointmentStatusMeta[status as keyof typeof appointmentStatusMeta]?.label ??
      status
    return `Este atendimento já está como "${label}". Recarregue a agenda para ver o estado atual.`
  },
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
    /**
     * Quem agenda já viu o aviso de horário fora do expediente e confirmou.
     *
     * Ausente = não confirmado, que é o padrão seguro: a primeira tentativa
     * sempre passa pela verificação. **Não é permissão** — o papel já foi
     * autorizado antes; é o registro de uma exceção deliberada, e por isso
     * aparece na auditoria.
     */
    confirmOutsideBusinessHours: z.boolean().optional().default(false),
    /**
     * Sala reservada — OPCIONAL, e é isso que preserva o que já existe.
     *
     * Ausente e string vazia viram `null`. O `<select>` do formulário manda
     * `''` quando "Sem sala definida" está escolhida, e um `''` chegando ao
     * banco como `room_id` seria recusado por não ser UUID — sobre a escolha
     * mais comum de todas.
     *
     * Toda clínica que não usa sala, e todo atendimento criado antes desta
     * fatia, continua válido: `room_id` fica nulo e a constraint de
     * sobreposição por sala (`where room_id is not null`) nem é avaliada.
     *
     * **Só na criação.** Remarcar mantém a sala e muda o horário; trocar de
     * sala é edição do atendimento, e a agenda ainda não a oferece.
     */
    roomId: z
      .union([z.literal(''), z.uuid(scheduleMessages.invalidFields)])
      .nullish()
      .transform((value) => (value ? value : null)),
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
      confirmOutsideBusinessHours: value.confirmOutsideBusinessHours,
      // Já normalizado acima: `''` e ausente chegam aqui como `null`.
      roomId: value.roomId,
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
    /** Ver o campo homônimo em `createAppointmentSchema`. */
    confirmOutsideBusinessHours: z.boolean().optional().default(false),
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
      confirmOutsideBusinessHours: value.confirmOutsideBusinessHours,
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
 * Confirmação — feature **A-03**.
 *
 * Só o id: o status de destino não vem do cliente. Aceitá-lo transformaria uma
 * action de confirmar numa de escrever qualquer status, e a máquina de estados
 * passaria a depender do que o navegador mandou.
 */
export const confirmAppointmentSchema = z.object({
  appointmentId: z.uuid(scheduleMessages.unexpected),
})

export type ConfirmAppointmentInput = z.infer<typeof confirmAppointmentSchema>

/**
 * Desfecho — feature **A-03**.
 *
 * `outcome` é um enum fechado de DOIS valores, e não `AppointmentStatus`: os
 * outros cinco não são desfecho, e aceitá-los aqui deixaria o cliente escrever
 * `canceled` sem passar pelo cancelamento (que grava motivo e notifica) ou
 * `in_progress` sem ninguém ter chegado.
 */
export const recordAppointmentOutcomeSchema = z.object({
  appointmentId: z.uuid(scheduleMessages.unexpected),
  outcome: z.enum(APPOINTMENT_OUTCOMES),
})

export type RecordAppointmentOutcomeInput = z.infer<
  typeof recordAppointmentOutcomeSchema
>

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
  /**
   * Nome da sala, quando há uma.
   *
   * Precisa atravessar porque a agenda faz atualização OTIMISTA: o atendimento
   * recém-criado entra na grade a partir deste DTO, sem recarregar. Sem o
   * campo aqui, quem acabou de reservar a sala veria o cartão sem ela até
   * atualizar a página — e concluiria que a reserva não pegou.
   */
  roomName?: string | null
}
