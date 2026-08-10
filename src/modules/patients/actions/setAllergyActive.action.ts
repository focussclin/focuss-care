'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { patientPaths } from '@/lib/routes/patientRoutes'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toAllergyFailure } from '../application/allergyFailure'
import { toAllergyDto } from '../application/toAllergyDto'
import { allergyRepositoryFor } from '../infrastructure/repository'
import {
  allergyMessages,
  setAllergyActiveSchema,
  type AllergyDto,
  type SetAllergyActiveInput,
} from '../schemas/allergy.schema'

type Fields = 'allergyId' | 'isActive'

/**
 * Tira a alergia da lista de atenção — **sem apagar**.
 *
 * Uma alergia descartada continua sendo história clínica: alguém afirmou
 * aquilo, e decisões podem ter sido tomadas com base na afirmação. `is_active`
 * a move para o histórico; não existe action de exclusão em lugar nenhum deste
 * módulo, e a ausência é a decisão.
 *
 * Os dois sentidos são auditados com ações distintas: descartar uma alergia é
 * um evento clínico que alguém pode precisar reconstruir depois.
 */
const runSetAllergyActive = createAction<SetAllergyActiveInput, AllergyDto, Fields>({
  name: 'allergy.set_active',
  schema: setAllergyActiveSchema,
  roles: rolesWith('record.write'),
  messages: {
    validation: allergyMessages.invalidFields,
    unavailable: allergyMessages.unavailable,
    unexpected: allergyMessages.unexpected,
  },
  revalidatePaths: (_scope, output) => patientPaths(output.patientId),
  handler: async (input, context) => {
    try {
      const allergy = await allergyRepositoryFor(context.supabase).setActive(
        context.clinicId,
        input.allergyId,
        input.isActive,
      )
      return ok(toAllergyDto(allergy))
    } catch (cause) {
      return toAllergyFailure<Fields>('allergy.set_active', cause)
    }
  },
  audit: (output) => ({
    action: output.isActive ? 'allergy.reactivated' : 'allergy.discarded',
    entityType: 'allergy',
    entityId: output.id,
    after: { patient_id: output.patientId, is_active: output.isActive },
  }),
})

export async function setAllergyActiveAction(
  rawInput: unknown,
): Promise<ActionResult<AllergyDto, Fields>> {
  return runSetAllergyActive(rawInput)
}
