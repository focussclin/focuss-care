import { getPatients } from '@/lib/mocks/clinic-data'
import type { Patient } from '@/modules/_shared/domain/types'

import type { PatientRepository } from '../domain/PatientRepository'

/**
 * Fallback usado enquanto o Supabase nao esta configurado.
 *
 * Implementa a mesma porta do adapter real, entao as telas nao sabem qual dos dois
 * esta em uso. Ao ligar o banco, este arquivo pode ser apagado sem tocar em UI.
 */
export class MockPatientRepository implements PatientRepository {
  constructor(private readonly today: Date) {}

  async listByClinic(): Promise<Patient[]> {
    return getPatients(this.today).sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'),
    )
  }

  async findById(_clinicId: string, patientId: string): Promise<Patient | null> {
    return (
      getPatients(this.today).find((patient) => patient.id === patientId) ?? null
    )
  }
}
