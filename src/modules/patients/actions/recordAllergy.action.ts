'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { patientPaths } from '@/lib/routes/patientRoutes'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toAllergyFailure } from '../application/allergyFailure'
import { toAllergyDto } from '../application/toAllergyDto'
import { findSameSubstance } from '../domain/Allergy'
import { allergyRepositoryFor } from '../infrastructure/repository'
import {
  allergyMessages,
  recordAllergySchema,
  type AllergyDto,
  type RecordAllergyInput,
} from '../schemas/allergy.schema'

type Fields = 'patientId' | 'substance' | 'reaction'

/**
 * Registra uma alergia na ficha.
 *
 * `record.write` — owner e professional. Afirmar que um paciente é alérgico a
 * alguma coisa é uma asserção clínica: quem não escreve prontuário não escreve
 * isso. Ler segue a mesma matriz, na rota.
 *
 * A checagem de substância repetida acontece no servidor, sobre a lista LIDA do
 * banco, e não sobre o que a tela mostrava. Duas entradas para a mesma
 * substância deixam quem lê sem saber qual vale — e a leitura apressada pega a
 * primeira.
 */
const runRecordAllergy = createAction<RecordAllergyInput, AllergyDto, Fields>({
  name: 'allergy.record',
  schema: recordAllergySchema,
  roles: rolesWith('record.write'),
  messages: {
    validation: allergyMessages.invalidFields,
    unavailable: allergyMessages.unavailable,
    unexpected: allergyMessages.unexpected,
  },
  revalidatePaths: (_scope, output) => patientPaths(output.patientId),
  handler: async (input, context) => {
    try {
      const repository = allergyRepositoryFor(context.supabase)
      const existing = await repository.listByPatient(context.clinicId, input.patientId)

      if (findSameSubstance(existing, input.substance)) {
        return err<Fields>('conflict', allergyMessages.duplicate)
      }

      const allergy = await repository.record(context.clinicId, context.userId, {
        patientId: input.patientId,
        substance: input.substance,
        reaction: input.reaction,
      })
      return ok(toAllergyDto(allergy))
    } catch (cause) {
      return toAllergyFailure<Fields>('allergy.record', cause)
    }
  },
  audit: (output) => ({
    action: 'allergy.recorded',
    entityType: 'allergy',
    entityId: output.id,
    after: { patient_id: output.patientId, substance: output.substance },
  }),
})

export async function recordAllergyAction(
  rawInput: unknown,
): Promise<ActionResult<AllergyDto, Fields>> {
  return runRecordAllergy(rawInput)
}
