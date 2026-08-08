import type { Appointment, Professional } from '@/modules/_shared/domain/types'

/** PORTA do modulo de agenda. */
export interface AppointmentRepository {
  /** Atendimentos de um intervalo [from, to). */
  listByRange(clinicId: string, from: Date, to: Date): Promise<Appointment[]>

  listByPatient(clinicId: string, patientId: string): Promise<Appointment[]>

  listProfessionals(clinicId: string): Promise<Professional[]>
}
