'use server'

import { createFormAction } from './createForm.action'
import { setFormStatusAction } from './setFormStatus.action'
import { updateFormAction } from './updateForm.action'
import type { FormFormValues } from '../schemas/form.schema'

export async function submitFormFromScreen(
  values: FormFormValues,
  formId: string | null,
): Promise<string | null> {
  const result = formId
    ? await updateFormAction({ formId, ...values })
    : await createFormAction(values)

  return result.ok ? null : result.error.message
}

export async function setFormStatusFromScreen(
  formId: string,
  status: FormFormValues['status'],
): Promise<string | null> {
  const result = await setFormStatusAction({ formId, status })
  return result.ok ? null : result.error.message
}
