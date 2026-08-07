import type { Patient } from '@/modules/_shared/domain/types'

/**
 * PORTA do modulo de pacientes.
 *
 * Os casos de uso e os Server Components dependem desta interface, nunca do SDK do
 * Supabase. Trocar o backend um dia mexe apenas em infrastructure/.
 */
export interface PatientRepository {
  /** Pacientes da clinica ativa, ordenados por nome. */
  listByClinic(clinicId: string): Promise<Patient[]>

  findById(clinicId: string, patientId: string): Promise<Patient | null>
}
