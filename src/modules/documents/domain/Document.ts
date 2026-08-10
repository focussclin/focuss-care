export const DOCUMENT_KINDS = [
  'rg',
  'cpf',
  'cns',
  'passport',
  'insurance_card',
  'consent_form',
  'other',
] as const

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export interface PatientDocument {
  id: string
  patientId: string
  patientName: string
  kind: DocumentKind
  storagePath: string
  fileName: string
  mimeType: string | null
  sizeBytes: number | null
  uploadedBy: string | null
  createdAt: Date
}

export interface NewPatientDocumentData {
  patientId: string
  kind: DocumentKind
  storagePath: string
  fileName: string
  mimeType: string | null
  sizeBytes: number | null
  uploadedBy: string
}
