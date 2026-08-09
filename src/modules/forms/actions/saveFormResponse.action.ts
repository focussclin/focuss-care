'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toFormResponseFailure } from '../application/formResponseFailure'
import { validateFormResponse } from '../application/formResponseValidation'
import { toFormResponseDto } from '../application/toFormResponseDto'
import { FormRepositoryError, isFormRepositoryError } from '../domain/FormRepositoryError'
import { formRepositoryFor, formResponseRepositoryFor } from '../infrastructure/repository'
import {
  formResponseMessages,
  saveFormResponseSchema,
  type FormResponseDto,
  type SaveFormResponseInput,
} from '../schemas/formResponse.schema'

type Fields = 'formId' | 'patientId' | 'responseId' | 'status' | 'answers'

const runSaveFormResponse = createAction<SaveFormResponseInput, FormResponseDto, Fields>({
  name: 'form_response.save',
  schema: saveFormResponseSchema,
  roles: rolesWith('patient.write'),
  messages: {
    validation: formResponseMessages.invalidFields,
    unavailable: formResponseMessages.unavailable,
    unexpected: formResponseMessages.unexpected,
  },
  handler: async (input, context) => {
    try {
      const form = await formRepositoryFor(context.supabase).findById(
        context.clinicId,
        input.formId,
      )
      if (!form || form.status !== 'published') {
        throw new FormRepositoryError('not-found', 'formulário não publicado')
      }

      const validationError = validateFormResponse(form, input.answers, input.status)
      if (validationError) return err<Fields>('validation', validationError)

      const repository = formResponseRepositoryFor(context.supabase)
      const response = input.responseId
        ? await repository.update(context.clinicId, input.responseId, input.formId, {
            status: input.status,
            answers: input.answers,
          })
        : await repository.create(context.clinicId, context.userId, {
            formId: input.formId,
            patientId: input.patientId,
            status: input.status,
            answers: input.answers,
          })

      return ok(toFormResponseDto(response))
    } catch (cause) {
      if (isFormRepositoryError(cause)) {
        if (cause.reason === 'schema-not-ready') {
          return err<Fields>('unavailable', formResponseMessages.schemaPending)
        }
        if (cause.reason === 'forbidden') {
          return err<Fields>('forbidden', formResponseMessages.forbidden)
        }
        return err<Fields>('not-found', formResponseMessages.formNotFound)
      }
      return toFormResponseFailure<Fields>('form_response.save', cause)
    }
  },
  audit: (output) => ({
    action: output.status === 'submitted' ? 'form_response.submitted' : 'form_response.saved',
    entityType: 'form_response',
    entityId: output.id,
    after: { form_id: output.formId, patient_id: output.patientId, status: output.status },
  }),
})

export async function saveFormResponseAction(
  rawInput: unknown,
): Promise<ActionResult<FormResponseDto, Fields>> {
  return runSaveFormResponse(rawInput)
}
