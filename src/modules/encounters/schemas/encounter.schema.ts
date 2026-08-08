import { z } from 'zod'

/**
 * Mensagens que só o servidor produz.
 *
 * Nenhuma carrega detalhe de banco (docs/06-acoes-e-auditoria.md §2).
 */
export const encounterMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  patientRequired: 'Selecione um paciente.',
  professionalRequired: 'Selecione o profissional que vai atender.',
  reasonTooLong: 'O motivo pode ter no máximo 200 caracteres.',
  /**
   * A recusa mais comum desta tela, e a única que não é defeito.
   *
   * A fila anda: outra pessoa da recepção chamou, iniciou ou encerrou enquanto
   * esta tela estava parada. Por isso a mensagem manda **atualizar**, e não
   * "tentar novamente" — tentar de novo com a mesma tela daria o mesmo erro.
   */
  invalidTransition:
    'A fila mudou desde que esta tela carregou. Atualize para ver o estado atual.',
  forbidden: 'Você não tem permissão para alterar a fila de atendimento.',
  notFound: 'Este registro não está mais disponível nesta clínica.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a ação agora. Tente novamente.',
} as const

/**
 * Prioridade na fila.
 *
 * Escala pequena e com significado, em vez de número livre: o que a recepção
 * precisa distinguir é urgência e prioridade legal (idoso, gestante, PCD) do
 * atendimento comum. Uma escala de 1 a 100 viraria disputa.
 */
export const priorityOptions = [
  { value: '1', label: 'Urgência' },
  { value: '3', label: 'Prioridade legal' },
  { value: '5', label: 'Normal' },
] as const

export const DEFAULT_PRIORITY = 5

export const checkInSchema = z.object({
  patientId: z.uuid(encounterMessages.patientRequired),
  /** Vincula à agenda quando existe hora marcada; ausente em encaixe. */
  appointmentId: z
    .string()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
    .refine(
      (value) => value === null || z.uuid().safeParse(value).success,
      encounterMessages.unexpected,
    ),
  professionalId: z
    .string()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
    .refine(
      (value) => value === null || z.uuid().safeParse(value).success,
      encounterMessages.professionalRequired,
    ),
  priority: z.coerce.number().int().min(1).max(9).catch(DEFAULT_PRIORITY),
  reason: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? '')
    .refine(
      (value) => value.length <= 200,
      encounterMessages.reasonTooLong,
    )
    .transform((value) => (value === '' ? null : value)),
})

export type CheckInInput = z.infer<typeof checkInSchema>

export const callPatientSchema = z.object({
  queueEntryId: z.uuid(encounterMessages.unexpected),
})

export type CallPatientInput = z.infer<typeof callPatientSchema>

export const startEncounterSchema = z.object({
  queueEntryId: z.uuid(encounterMessages.unexpected),
  professionalId: z.uuid(encounterMessages.professionalRequired),
})

export type StartEncounterInput = z.infer<typeof startEncounterSchema>

export const closeEncounterSchema = z.object({
  encounterId: z.uuid(encounterMessages.unexpected),
})

export type CloseEncounterInput = z.infer<typeof closeEncounterSchema>

/**
 * O que as Server Actions devolvem ao cliente.
 *
 * Somente escalares: `Date` e linha crua do Supabase não atravessam a fronteira.
 *
 * **`reason` não está aqui.** Ele é texto livre da recepção e, em clínica,
 * costuma descrever a queixa ("dor no peito"). A tela mostra a fila; quem
 * precisa da queixa abre o prontuário, que tem auditoria de leitura própria.
 */
export interface QueueEntryDto {
  id: string
  patientId: string
  patientName: string
  appointmentId: string | null
  professionalId: string | null
  professionalName: string | null
  priority: number
  status: string
  /** ISO 8601 completo, em UTC. */
  arrivedAt: string
  calledAt: string | null
  startedAt: string | null
}

export interface EncounterDto {
  id: string
  patientId: string
  patientName: string
  professionalId: string
  professionalName: string
  appointmentId: string | null
  status: string
  startsAt: string
  endedAt: string | null
}
