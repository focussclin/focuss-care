'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toFormFailure } from '../application/formFailure'
import { toFormDto } from '../application/toFormDto'
import { formRepositoryFor } from '../infrastructure/repository'
import {
  createFormSchema,
  formMessages,
  type CreateFormInput,
  type FormDto,
} from '../schemas/form.schema'

type Fields = 'name' | 'description' | 'type' | 'status' | 'fields'

const runCreateForm = createAction<CreateFormInput, FormDto, Fields>({
  name: 'form.create',
  schema: createFormSchema,
  roles: rolesWith('clinic.settings'),
  messages: {
    validation: formMessages.invalidFields,
    unavailable: formMessages.unavailable,
    unexpected: formMessages.unexpected,
  },
  revalidatePaths: ['/formularios'],
  handler: async (input, context) => {
    try {
      const form = await formRepositoryFor(context.supabase).create(
        context.clinicId,
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
      return toFormFailure<Fields>('form.create', cause)
    }
  },
  audit: (output) => ({
    action: 'form.created',
    entityType: 'form',
    entityId: output.id,
    after: { status: output.status, field_count: output.fields.length },
  }),
})

export async function createFormAction(
  rawInput: unknown,
): Promise<ActionResult<FormDto, Fields>> {
  return runCreateForm(rawInput)
}
