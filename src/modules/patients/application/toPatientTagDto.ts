import type { PatientTag } from '../domain/PatientTag'
import type { PatientTagDto } from '../schemas/patientTag.schema'

export function toPatientTagDto(tag: PatientTag): PatientTagDto {
  return { id: tag.id, name: tag.name, color: tag.color }
}
