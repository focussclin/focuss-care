import type { Form } from '../domain/Form'
import type { FormAnswers, FormResponseStatus } from '../domain/FormResponse'
import { formResponseMessages } from '../schemas/formResponse.schema'

function hasAnswer(value: string | readonly string[] | undefined): boolean {
  if (Array.isArray(value)) return value.some((item) => item.trim().length > 0)
  return typeof value === 'string' && value.trim().length > 0
}

export function validateFormResponse(
  form: Form,
  answers: FormAnswers,
  status: FormResponseStatus,
): string | null {
  const fieldIds = new Set(form.fields.map((field) => field.id))
  if (Object.keys(answers).some((fieldId) => !fieldIds.has(fieldId))) {
    return formResponseMessages.unknownField
  }

  if (
    status === 'submitted' &&
    form.fields.some((field) => field.type === 'signature' || field.type === 'upload')
  ) {
    return formResponseMessages.unsupportedField
  }

  if (
    status === 'submitted' &&
    form.fields.some((field) => field.required && !hasAnswer(answers[field.id]))
  ) {
    return formResponseMessages.requiredField
  }

  return null
}
