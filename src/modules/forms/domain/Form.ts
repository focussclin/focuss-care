export const FORM_TYPES = [
  'intake',
  'anamnesis',
  'consent',
  'feedback',
  'custom',
] as const

export type FormType = (typeof FORM_TYPES)[number]

export const FORM_STATUSES = ['draft', 'published', 'archived'] as const
export type FormStatus = (typeof FORM_STATUSES)[number]

export const FORM_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'select',
  'checkbox',
  'radio',
  'scale',
  'signature',
  'upload',
] as const

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number]

export interface FormField {
  id: string
  label: string
  type: FormFieldType
  required: boolean
  helpText: string | null
  options: readonly string[]
}

export interface Form {
  id: string
  name: string
  description: string | null
  type: FormType
  status: FormStatus
  fields: readonly FormField[]
  version: number
  createdAt: Date
  updatedAt: Date
}

export interface NewFormData {
  name: string
  description: string | null
  type: FormType
  status: FormStatus
  fields: readonly FormField[]
}

export type FormUpdateData = Partial<NewFormData>
