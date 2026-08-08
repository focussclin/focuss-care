import { getAppointments, professionals } from '@/lib/mocks/clinic-data'
import type { Appointment, Professional } from '@/modules/_shared/domain/types'

import type { AppointmentRepository } from '../domain/AppointmentRepository'
import { AppointmentRepositoryError } from '../domain/AppointmentRepositoryError'

/** Fallback usado enquanto o Supabase nao esta configurado. */
export class MockAppointmentRepository implements AppointmentRepository {
  constructor(private readonly today: Date) {}

  async listByRange(
    _clinicId: string,
    from: Date,
    to: Date,
  ): Promise<Appointment[]> {
    return getAppointments(this.today)
      .filter(
        (appointment) =>
          appointment.startsAt >= from && appointment.startsAt < to,
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  }

  async listByPatient(
    _clinicId: string,
    patientId: string,
  ): Promise<Appointment[]> {
    return getAppointments(this.today)
      .filter((appointment) => appointment.patientId === patientId)
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
  }

  async listProfessionals(): Promise<Professional[]> {
    return [...professionals]
  }

  /**
   * Escrita nao existe na demonstracao — e por isso que estes metodos falham em
   * vez de devolverem um atendimento.
   *
   * Devolver um objeto daria "agendado com sucesso" para algo que nao saiu da
   * memoria do processo: exatamente o R11 do roadmap (vitrine parecendo pronta).
   * A demonstracao continua com o agendamento local da AgendaScreen, que anuncia
   * o proprio limite na tela.
   *
   * Na pratica este caminho e inalcancavel: as actions so rodam com sessao e
   * clinica ativa, e ai o adapter em uso e o do Supabase. A implementacao existe
   * porque a porta a exige.
   */
  async create(): Promise<never> {
    return this.refuseWrite('create')
  }

  async reschedule(): Promise<never> {
    return this.refuseWrite('reschedule')
  }

  async cancel(): Promise<never> {
    return this.refuseWrite('cancel')
  }

  private refuseWrite(operation: string): never {
    throw new AppointmentRepositoryError(
      'unavailable',
      `MockAppointmentRepository nao persiste (${operation}): escrita real exige Supabase configurado.`,
    )
  }
}
