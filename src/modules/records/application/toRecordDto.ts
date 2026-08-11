import type { MedicalRecord, RecordEncounter } from '../domain/MedicalRecord'
import type {
  MedicalRecordDto,
  RecordEncounterDto,
} from '../schemas/record.schema'

/**
 * Atendimento -> o que a tela e o seletor de vínculo recebem.
 *
 * `Date` não atravessa a fronteira do servidor para o cliente sem virar string
 * em algum ponto; fazer isso aqui deixa o formato explícito e igual ao do
 * registro (ISO 8601 em UTC, formatado na tela pelo fuso de quem lê).
 */
export function toRecordEncounterDto(
  encounter: RecordEncounter,
): RecordEncounterDto {
  return {
    id: encounter.id,
    status: encounter.status,
    startedAt: encounter.startedAt.toISOString(),
    endedAt: encounter.endedAt?.toISOString() ?? null,
    professionalName: encounter.professionalName,
    chiefComplaint: encounter.chiefComplaint,
  }
}

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
    encounter: record.encounter ? toRecordEncounterDto(record.encounter) : null,
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
