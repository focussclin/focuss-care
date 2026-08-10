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
  type UpdateFormInput,
  updateFormSchema,
} from '../schemas/form.schema'

type Fields = 'formId' | 'name' | 'description' | 'type' | 'status' | 'fields'

const runUpdateForm = createAction<UpdateFormInput, FormDto, Fields>({
  name: 'form.update',
  schema: updateFormSchema,
  roles: rolesWith('clinic.settings'),
  messages: {
    validation: formMessages.invalidFields,
    unavailable: formMessages.unavailable,
    unexpected: formMessages.unexpected,
  },
  revalidatePaths: ['/formularios'],
  handler: async (input, context) => {
    try {
      const form = await formRepositoryFor(context.supabase).update(
        context.clinicId,
        input.formId,
        context.userId,
        {
          name: input.name,
          description: input.description,
          type: input.type,
          status: input.status,
          fields: input.fields,
        },
      )
      return ok(toFormDto(form))
    } catch (cause) {
      return toFormFailure<Fields>('form.update', cause)
    }
  },
  audit: (output) => ({
    action: 'form.updated',
    entityType: 'form',
    entityId: output.id,
    after: { status: output.status, field_count: output.fields.length },
  }),
})

export async function updateFormAction(
  rawInput: unknown,
): Promise<ActionResult<FormDto, Fields>> {
  return runUpdateForm(rawInput)
}
