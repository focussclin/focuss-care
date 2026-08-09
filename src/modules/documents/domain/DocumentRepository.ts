import type { DocumentKind, NewPatientDocumentData, PatientDocument } from './Document'

export interface DocumentListQuery {
  kind: DocumentKind | null
  patientId: string | null
}

export interface DocumentRepository {
  list(clinicId: string, query: DocumentListQuery): Promise<PatientDocument[]>
  findById(clinicId: string, documentId: string): Promise<PatientDocument | null>
  create(
    clinicId: string,
    data: NewPatientDocumentData,
  ): Promise<PatientDocument>
}
