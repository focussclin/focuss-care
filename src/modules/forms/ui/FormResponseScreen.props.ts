import type { FormResponseDto } from '../schemas/formResponse.schema'
import type { FormDto } from '../schemas/form.schema'

export interface FormResponseScreenProps {
  form: FormDto
  patients: readonly { id: string; name: string }[]
  onSave: (
    values: {
      formId: string
      patientId: string
      responseId: string | null
      status: 'draft' | 'submitted'
      answers: Readonly<Record<string, string | readonly string[]>>
    },
  ) => Promise<{ error: string | null; response: FormResponseDto | null }>
  isLive: boolean
}
