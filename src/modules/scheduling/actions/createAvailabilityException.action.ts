'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toAvailabilityFailure } from '../application/availabilityFailure'
import { availabilityExceptionRepositoryFor } from '../infrastructure/availability-repository'
import {
  availabilityMessages,
  createAvailabilityExceptionSchema,
  type AvailabilityExceptionDto,
  type CreateAvailabilityExceptionInput,
} from '../schemas/availabilityException.schema'

type Fields = 'professionalId' | 'kind' | 'startsAt' | 'endsAt' | 'reason'

/**
 * Cria um bloqueio ou uma janela extra na agenda.
 *
 * `appointment.write` — quem marca é quem bloqueia. Exigir `clinic.settings`
 * deixaria a recepção sem poder fechar a agenda de um profissional que ligou
 * doente pela manhã, que é justamente quando o bloqueio serve.
 *
 * # Bloquear não move atendimento
 *
 * Um bloqueio criado por cima de agenda cheia deixa os atendimentos onde
 * estão, agora dentro de uma janela que diz estar fechada — e ninguém é
 * avisado. Por isso a contagem vem antes: com atendimento vivo na janela, o
 * bloqueio é recusado e quem cria decide o que fazer com cada um.
 *
 * `extra` não sofre disso: abrir horário não conflita com quem já está marcado.
 */
const runCreateAvailabilityException = createAction<
  CreateAvailabilityExceptionInput,
  AvailabilityExceptionDto,
  Fields
>({
  name: 'availability_exception.create',
  schema: createAvailabilityExceptionSchema,
  roles: rolesWith('appointment.write'),
  messages: {
    validation: availabilityMessages.invalidFields,
    unavailable: availabilityMessages.unavailable,
    unexpected: availabilityMessages.unexpected,
  },
  revalidatePaths: ['/agenda', '/configuracoes'],
  handler: async (input, context) => {
    const startsAt = new Date(input.startsAt)
    const endsAt = new Date(input.endsAt)

    try {
      const repository = availabilityExceptionRepositoryFor(context.supabase)

      if (input.kind === 'block') {
        const marcados = await repository.countAppointmentsIn(
          context.clinicId,
          startsAt,
          endsAt,
          input.professionalId,
        )
        if (marcados > 0) {
          return err<Fields>('conflict', availabilityMessages.hasAppointments)
        }
      }

      const exception = await repository.create(context.clinicId, context.userId, {
        professionalId: input.professionalId,
        kind: input.kind,
        startsAt,
        endsAt,
        reason: input.reason,
      })

      return ok({
        id: exception.id,
        professionalId: exception.professionalId,
        professionalName: exception.professionalName,
        kind: exception.kind,
        startsAt: exception.startsAt.toISOString(),
        endsAt: exception.endsAt.toISOString(),
        reason: exception.reason,
      })
    } catch (cause) {
      return toAvailabilityFailure<Fields>('availability_exception.create', cause)
    }
  },
  audit: (output) => ({
    action:
      output.kind === 'block'
        ? 'availability_exception.blocked'
        : 'availability_exception.opened',
    entityType: 'availability_exception',
    entityId: output.id,
    after: {
      professional_id: output.professionalId,
      starts_at: output.startsAt,
      ends_at: output.endsAt,
    },
  }),
})

export async function createAvailabilityExceptionAction(
  rawInput: unknown,
): Promise<ActionResult<AvailabilityExceptionDto, Fields>> {
  return runCreateAvailabilityException(rawInput)
}
