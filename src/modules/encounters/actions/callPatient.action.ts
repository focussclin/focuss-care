'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toEncounterFailure } from '../application/encounterFailure'
import { toQueueEntryDto } from '../application/toEncounterDto'
import { encounterRepositoryFor } from '../infrastructure/repository'
import {
  callPatientSchema,
  encounterMessages,
  type CallPatientInput,
  type QueueEntryDto,
} from '../schemas/encounter.schema'

/**
 * Chamar o paciente — `waiting` -> `called` (**E-01**).
 *
 * Passo próprio, e não parte de "iniciar", porque **"chamei e ninguém veio" é
 * informação que a clínica precisa ter**. Sem ele, a espera de quem não
 * respondeu ficaria indistinguível da espera de quem ainda nem foi chamado, e
 * a fila perderia a única evidência de que o paciente foi procurado.
 *
 * A transição é protegida por `status = 'waiting'` no `where` do adapter: se
 * outra pessoa da recepção já chamou, esta chamada não acha linha e volta como
 * "a fila mudou" — em vez de sobrescrever a hora da primeira chamada.
 */
const runCallPatient = createAction<CallPatientInput, QueueEntryDto>({
  name: 'encounter.call',
  schema: callPatientSchema,
  roles: rolesWith('encounter.write'),
  messages: {
    forbidden: encounterMessages.forbidden,
    validation: encounterMessages.invalidFields,
    unavailable: encounterMessages.unavailable,
    unexpected: encounterMessages.unexpected,
  },
  revalidatePaths: ['/atendimentos'],

  handler: async (input, context) => {
    const repository = encounterRepositoryFor(context.supabase)

    try {
      const entry = await repository.call(
        context.clinicId,
        input.queueEntryId,
      )

      return ok<QueueEntryDto>(toQueueEntryDto(entry))
    } catch (cause) {
      return toEncounterFailure('encounter.call', cause)
    }
  },

  audit: (output) => ({
    action: 'encounter.called',
    entityType: 'waiting_queue',
    entityId: output.id,
  }),
})

export async function callPatientAction(
  rawInput: unknown,
): Promise<ActionResult<QueueEntryDto>> {
  return runCallPatient(rawInput)
}
