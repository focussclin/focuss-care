import type { PatientDocument } from '../domain/Document'
import type { DocumentDto } from '../schemas/document.schema'

export function toDocumentDto(document: PatientDocument): DocumentDto {
  return {
    id: document.id,
    patientId: document.patientId,
    patientName: document.patientName,
    kind: document.kind,
    fileName: document.fileName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    createdAt: document.createdAt.toISOString(),
  }
}
