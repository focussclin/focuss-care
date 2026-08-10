'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toAvailabilityFailure } from '../application/availabilityFailure'
import { availabilityExceptionRepositoryFor } from '../infrastructure/availability-repository'
import {
  availabilityMessages,
  removeAvailabilityExceptionSchema,
  type AvailabilityExceptionFormValues,
  type RemoveAvailabilityExceptionInput,
} from '../schemas/availabilityException.schema'
import { createAvailabilityExceptionAction } from './createAvailabilityException.action'

type RemoveFields = 'exceptionId'

/**
 * Remove a exceção — e aqui remover é remover mesmo.
 *
 * Ao contrário de alergia, um bloqueio é configuração operacional, não
 * afirmação clínica: apagar o feriado cadastrado com o ano errado não apaga
 * história de ninguém. O que fica é o evento de auditoria.
 */
const runRemoveAvailabilityException = createAction<
  RemoveAvailabilityExceptionInput,
  { id: string },
  RemoveFields
>({
  name: 'availability_exception.remove',
  schema: removeAvailabilityExceptionSchema,
  roles: rolesWith('appointment.write'),
  messages: {
    validation: availabilityMessages.invalidFields,
    unavailable: availabilityMessages.unavailable,
    unexpected: availabilityMessages.unexpected,
  },
  revalidatePaths: ['/agenda', '/configuracoes'],
  handler: async (input, context) => {
    try {
      await availabilityExceptionRepositoryFor(context.supabase).remove(
        context.clinicId,
        input.exceptionId,
      )
      return ok({ id: input.exceptionId })
    } catch (cause) {
      return toAvailabilityFailure<RemoveFields>('availability_exception.remove', cause)
    }
  },
  audit: (output) => ({
    action: 'availability_exception.removed',
    entityType: 'availability_exception',
    entityId: output.id,
  }),
})

export async function createAvailabilityExceptionFromPanel(
  values: AvailabilityExceptionFormValues,
): Promise<string | null> {
  const result = await createAvailabilityExceptionAction(values)
  return result.ok ? null : result.error.message
}

export async function removeAvailabilityExceptionFromPanel(
  exceptionId: string,
): Promise<string | null> {
  const result = await runRemoveAvailabilityException({ exceptionId })
  return result.ok ? null : result.error.message
}

export async function removeAvailabilityExceptionAction(
  rawInput: unknown,
): Promise<ActionResult<{ id: string }, RemoveFields>> {
  return runRemoveAvailabilityException(rawInput)
}
