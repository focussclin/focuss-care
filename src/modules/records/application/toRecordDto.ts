import type { MedicalRecord } from '../domain/MedicalRecord'
import type { MedicalRecordDto } from '../schemas/record.schema'

/**
 * Entidade -> o que atravessa a fronteira da Server Action.
 *
 * `content` viaja porque é o que o profissional acabou de escrever, voltando
 * para ele. `content_hash` e o jsonb bruto não: o hash é dado de integridade e
 * o jsonb é a mesma informação em outra forma — duplicar conteúdo clínico no
 * payload sem uso é superfície de vazamento de graça.
 */
export function toMedicalRecordDto(record: MedicalRecord): MedicalRecordDto {
  return {
    id: record.id,
    patientId: record.patientId,
    encounterId: record.encounterId,
    authorId: record.authorId,
    authorName: record.authorName,
    recordType: record.recordType,
    content: record.content,
    version: record.version,
    supersedesId: record.supersedesId,
    signedAt: record.signedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
  }
}
