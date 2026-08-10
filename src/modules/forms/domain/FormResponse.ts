export const FORM_RESPONSE_STATUSES = ['draft', 'submitted'] as const
export type FormResponseStatus = (typeof FORM_RESPONSE_STATUSES)[number]

export type FormAnswers = Readonly<Record<string, string | readonly string[]>>

export interface FormResponse {
  id: string
  formId: string
  patientId: string
  status: FormResponseStatus
  answers: FormAnswers
  submittedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface NewFormResponseData {
  formId: string
  patientId: string
  status: FormResponseStatus
  answers: FormAnswers
}

export type FormResponseUpdateData = Partial<
  Pick<NewFormResponseData, 'status' | 'answers'>
>
