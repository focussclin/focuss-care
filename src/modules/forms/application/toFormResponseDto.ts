import type { FormResponse } from '../domain/FormResponse'
import type { FormResponseDto } from '../schemas/formResponse.schema'

export function toFormResponseDto(response: FormResponse): FormResponseDto {
  return {
    id: response.id,
    formId: response.formId,
    patientId: response.patientId,
    status: response.status,
    answers: response.answers,
    submittedAt: response.submittedAt?.toISOString() ?? null,
    createdAt: response.createdAt.toISOString(),
    updatedAt: response.updatedAt.toISOString(),
  }
}
