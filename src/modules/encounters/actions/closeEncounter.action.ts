'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createEncounterNotification } from '@/lib/notifications/operational'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toEncounterFailure } from '../application/encounterFailure'
import { toEncounterDto } from '../application/toEncounterDto'
import { encounterRepositoryFor } from '../infrastructure/repository'
import {
  closeEncounterSchema,
  encounterMessages,
  type CloseEncounterInput,
  type EncounterDto,
} from '../schemas/encounter.schema'

/**
 * Encerrar o atendimento (**E-01**).
 *
 * Encerrar **não é cancelar e não apaga**. O atendimento aconteceu, e o
 * registro de que aconteceu — com início e fim — é o que sustenta prontuário e
 * faturamento depois.
 *
 * O adapter protege a transição com `status = 'open'`: encerrar duas vezes não
 * acha linha na segunda, em vez de sobrescrever `ended_at` e fazer o
 * atendimento parecer mais curto do que foi.
 */
const runCloseEncounter = createAction<CloseEncounterInput, EncounterDto>({
  name: 'encounter.close',
  schema: closeEncounterSchema,
  roles: rolesWith('encounter.write'),
  messages: {
    forbidden: encounterMessages.forbidden,
    validation: encounterMessages.invalidFields,
    unavailable: encounterMessages.unavailable,
    unexpected: encounterMessages.unexpected,
  },
  revalidatePaths: ['/atendimentos', '/dashboard'],

  afterSuccess: async (output, _input, context) => {
    await createEncounterNotification({
      client: context.supabase,
      clinicId: context.clinicId,
      userId: context.userId,
      kind: 'closed',
      patientName: output.patientName,
      eventAt: output.endedAt ?? output.startsAt,
    })
  },

  handler: async (input, context) => {
    const repository = encounterRepositoryFor(context.supabase)

    try {
      const encounter = await repository.close(
        context.clinicId,
        input.encounterId,
      )

      return ok<EncounterDto>(toEncounterDto(encounter))
    } catch (cause) {
      return toEncounterFailure('encounter.close', cause)
    }
  },

  audit: (output) => ({
    action: 'encounter.closed',
    entityType: 'encounter',
    entityId: output.id,
    after: { ended_at: output.endedAt },
  }),
})

export async function closeEncounterAction(
  rawInput: unknown,
): Promise<ActionResult<EncounterDto>> {
  return runCloseEncounter(rawInput)
}
