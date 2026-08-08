import { getAppointments, professionals } from '@/lib/mocks/clinic-data'
import type { Appointment, Professional } from '@/modules/_shared/domain/types'

import type { AppointmentRepository } from '../domain/AppointmentRepository'

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
}
