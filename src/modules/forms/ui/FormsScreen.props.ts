import type { FormDto, FormFormValues } from '../schemas/form.schema'

export interface FormsScreenProps {
  forms: readonly FormDto[]
  onSubmit: (
    values: FormFormValues,
    formId: string | null,
  ) => Promise<string | null>
  onSetStatus: (
    formId: string,
    status: FormFormValues['status'],
  ) => Promise<string | null>
  isLive: boolean
  schemaPending?: boolean
}
