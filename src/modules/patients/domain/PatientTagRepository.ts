import type { AddPatientTagData, PatientTag } from './PatientTag'

export interface PatientTagRepository {
  listByPatient(clinicId: string, patientId: string): Promise<PatientTag[]>
  addToPatient(
    clinicId: string,
    data: AddPatientTagData,
  ): Promise<PatientTag>
  removeFromPatient(
    clinicId: string,
    patientId: string,
    tagId: string,
  ): Promise<void>
}
