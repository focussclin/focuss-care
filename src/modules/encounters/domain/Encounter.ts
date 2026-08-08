/**
 * Tipos do módulo de atendimento.
 *
 * Vivem aqui, e não em `_shared/domain/types.ts`, porque só esta fatia os usa.
 * `Patient` e `Appointment` moram no compartilhado porque três telas os
 * mostram; fila e atendimento são vocabulário de uma tela só, e promovê-los
 * cedo demais espalharia mudança por módulos que não os conhecem.
 */

/** Espelha o enum `queue_status` do banco. */
export type QueueStatus =
  | 'waiting'
  | 'called'
  | 'in_service'
  | 'done'
  | 'abandoned'

/** Espelha o enum `encounter_status` do banco. */
export type EncounterStatus = 'open' | 'closed' | 'canceled'

/**
 * Uma pessoa esperando.
 *
 * A fila é o registro de quem CHEGOU — não de quem tinha hora marcada. Um
 * encaixe sem agendamento tem `appointmentId` nulo e é tão real quanto os
 * outros; alguém que marcou e não veio simplesmente não está aqui.
 */
export interface QueueEntry {
  id: string
  patientId: string
  patientName: string
  /** Null em encaixe: chegou sem hora marcada. */
  appointmentId: string | null
  /** Null enquanto a recepção não define quem vai atender. */
  professionalId: string | null
  professionalName: string | null
  /**
   * Menor número atende primeiro.
   *
   * Existe para urgência e para prioridade legal (idoso, gestante, PCD) — não
   * para ordenar por quem reclamou mais alto na recepção.
   */
  priority: number
  status: QueueStatus
  /** Motivo declarado na chegada. Não é queixa clínica. */
  reason: string | null
  arrivedAt: Date
  calledAt: Date | null
  startedAt: Date | null
  finishedAt: Date | null
}

/** Atendimento em curso ou encerrado. */
export interface Encounter {
  id: string
  patientId: string
  patientName: string
  professionalId: string
  professionalName: string
  /** Null quando nasceu de um encaixe, sem agendamento por trás. */
  appointmentId: string | null
  status: EncounterStatus
  startedAt: Date
  endedAt: Date | null
}

/** Números do topo da tela — consulta própria, não derivação da lista. */
export interface EncounterMetrics {
  /** Pessoas aguardando ou chamadas, ainda não atendidas. */
  waiting: number
  /** Atendimentos abertos agora. */
  inService: number
  /** Atendimentos encerrados no dia de referência. */
  closedToday: number
}
