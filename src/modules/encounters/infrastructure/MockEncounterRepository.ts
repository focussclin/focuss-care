import { getAppointments } from '@/lib/mocks/clinic-data'

import type {
  Encounter,
  EncounterMetrics,
  QueueEntry,
} from '../domain/Encounter'
import type { EncounterRepository } from '../domain/EncounterRepository'
import { EncounterRepositoryError } from '../domain/EncounterRepositoryError'

/**
 * Fallback usado enquanto o Supabase nao esta configurado.
 *
 * A fila de demonstracao e DERIVADA dos agendamentos de hoje que ja passaram do
 * horario — nao ha uma lista de fila inventada em `clinic-data`. E a
 * aproximacao mais honesta: numa clinica real, quem esta na fila e quem tinha
 * hora e chegou.
 */
export class MockEncounterRepository implements EncounterRepository {
  constructor(private readonly today: Date) {}

  async listQueue(_clinicId: string, day: Date): Promise<QueueEntry[]> {
    return this.sameDayAppointments(day)
      .filter((appointment) => appointment.status !== 'canceled')
      .map((appointment, index) => ({
        id: `queue-mock-${appointment.id}`,
        patientId: appointment.patientId,
        patientName: appointment.patientName,
        appointmentId: appointment.id,
        professionalId: appointment.professionalId,
        professionalName: appointment.professionalName,
        priority: 5,
        status:
          appointment.status === 'in_progress'
            ? ('in_service' as const)
            : appointment.status === 'completed'
              ? ('done' as const)
              : index === 0
                ? ('called' as const)
                : ('waiting' as const),
        reason: appointment.type,
        arrivedAt: appointment.startsAt,
        calledAt: null,
        startedAt: null,
        finishedAt: null,
      }))
  }

  async listEncounters(_clinicId: string, day: Date): Promise<Encounter[]> {
    return this.sameDayAppointments(day)
      .filter(
        (appointment) =>
          appointment.status === 'in_progress' ||
          appointment.status === 'completed',
      )
      .map((appointment) => ({
        id: `enc-mock-${appointment.id}`,
        patientId: appointment.patientId,
        patientName: appointment.patientName,
        professionalId: appointment.professionalId,
        professionalName: appointment.professionalName,
        appointmentId: appointment.id,
        status:
          appointment.status === 'completed'
            ? ('closed' as const)
            : ('open' as const),
        startedAt: appointment.startsAt,
        endedAt:
          appointment.status === 'completed'
            ? new Date(
                appointment.startsAt.getTime() +
                  appointment.durationMinutes * 60_000,
              )
            : null,
      }))
  }

  async countMetrics(
    clinicId: string,
    day: Date,
  ): Promise<EncounterMetrics> {
    const queue = await this.listQueue(clinicId, day)
    const encounters = await this.listEncounters(clinicId, day)

    return {
      waiting: queue.filter(
        (entry) => entry.status === 'waiting' || entry.status === 'called',
      ).length,
      inService: queue.filter((entry) => entry.status === 'in_service').length,
      closedToday: encounters.filter((entry) => entry.status === 'closed')
        .length,
    }
  }

  /**
   * Escrita nao existe na demonstracao — e por isso que estes metodos falham em
   * vez de devolverem uma linha.
   *
   * Devolver um objeto daria "check-in feito" para algo que nao saiu da memoria
   * do processo: exatamente o R11 do roadmap. Na pratica este caminho e
   * inalcancavel — as actions so rodam com sessao e clinica ativa, e ai o
   * adapter em uso e o do Supabase.
   */
  async checkIn(): Promise<never> {
    return this.refuseWrite('checkIn')
  }

  async call(): Promise<never> {
    return this.refuseWrite('call')
  }

  async start(): Promise<never> {
    return this.refuseWrite('start')
  }

  async close(): Promise<never> {
    return this.refuseWrite('close')
  }

  private sameDayAppointments(day: Date) {
    const from = new Date(day)
    from.setHours(0, 0, 0, 0)

    const to = new Date(from)
    to.setDate(to.getDate() + 1)

    return getAppointments(this.today)
      .filter(
        (appointment) =>
          appointment.startsAt >= from && appointment.startsAt < to,
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  }

  private refuseWrite(operation: string): never {
    throw new EncounterRepositoryError(
      'unavailable',
      `MockEncounterRepository nao persiste (${operation}): escrita real exige Supabase configurado.`,
    )
  }
}
