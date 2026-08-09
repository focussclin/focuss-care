import type { Form } from '../domain/Form'
import type { FormDto } from '../schemas/form.schema'

export function toFormDto(form: Form): FormDto {
  return {
    id: form.id,
    name: form.name,
    description: form.description,
    type: form.type,
    status: form.status,
    fields: form.fields.map((field) => ({
      id: field.id,
      label: field.label,
      type: field.type,
      required: field.required,
      helpText: field.helpText,
      options: [...field.options],
    })),
    version: form.version,
    createdAt: form.createdAt.toISOString(),
    updatedAt: form.updatedAt.toISOString(),
  }
}
