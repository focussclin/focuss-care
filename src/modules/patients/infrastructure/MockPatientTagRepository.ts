import type { PatientTagRepository } from '../domain/PatientTagRepository'
import type { PatientTag } from '../domain/PatientTag'
import { PatientTagRepositoryError } from '../domain/PatientTagRepositoryError'

/** O modo demo não inventa segmentação de pacientes. */
export class MockPatientTagRepository implements PatientTagRepository {
  async listByPatient(): Promise<PatientTag[]> {
    return []
  }

  async addToPatient(): Promise<PatientTag> {
    throw new PatientTagRepositoryError(
      'schema-not-ready',
      'tags indisponíveis no modo demonstração',
    )
  }

  async removeFromPatient(): Promise<void> {
    throw new PatientTagRepositoryError(
      'schema-not-ready',
      'tags indisponíveis no modo demonstração',
    )
  }
}
