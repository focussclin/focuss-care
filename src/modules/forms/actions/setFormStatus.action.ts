'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toFormFailure } from '../application/formFailure'
import { toFormDto } from '../application/toFormDto'
import { formRepositoryFor } from '../infrastructure/repository'
import {
  formMessages,
  type FormDto,
  type SetFormStatusInput,
  setFormStatusSchema,
} from '../schemas/form.schema'

type Fields = 'formId' | 'status'

const runSetFormStatus = createAction<SetFormStatusInput, FormDto, Fields>({
  name: 'form.status',
  schema: setFormStatusSchema,
  roles: rolesWith('clinic.settings'),
  messages: {
    validation: formMessages.invalidFields,
    unavailable: formMessages.unavailable,
    unexpected: formMessages.unexpected,
  },
  revalidatePaths: ['/formularios'],
  handler: async (input, context) => {
    try {
      const form = await formRepositoryFor(context.supabase).setStatus(
        context.clinicId,
        input.formId,
        context.userId,
        input.status,
      )
      return ok(toFormDto(form))
    } catch (cause) {
      return toFormFailure<Fields>('form.status', cause)
    }
  },
  audit: (output) => ({
    action: 'form.status_changed',
    entityType: 'form',
    entityId: output.id,
    after: { status: output.status },
  }),
})

export async function setFormStatusAction(
  rawInput: unknown,
): Promise<ActionResult<FormDto, Fields>> {
  return runSetFormStatus(rawInput)
}
