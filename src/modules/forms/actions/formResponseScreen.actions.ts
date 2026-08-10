'use server'

import { saveFormResponseAction } from './saveFormResponse.action'
import type { FormResponseDto } from '../schemas/formResponse.schema'

export async function saveFormResponseFromScreen(values: {
  formId: string
  patientId: string
  responseId: string | null
  status: 'draft' | 'submitted'
  answers: Readonly<Record<string, string | readonly string[]>>
}): Promise<{ error: string | null; response: FormResponseDto | null }> {
  const result = await saveFormResponseAction(values)
  return result.ok
    ? { error: null, response: result.data }
    : { error: result.error.message, response: null }
}
