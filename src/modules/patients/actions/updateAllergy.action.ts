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
  updateAllergySchema,
  type AllergyDto,
  type UpdateAllergyInput,
} from '../schemas/allergy.schema'

type Fields = 'allergyId' | 'substance' | 'reaction'

/**
 * Corrige o que foi registrado — substância e descrição da reação.
 *
 * A checagem de duplicidade ignora a própria linha: renomear "dipirona" para
 * "Dipirona" não pode colidir consigo mesma.
 */
const runUpdateAllergy = createAction<UpdateAllergyInput, AllergyDto, Fields>({
  name: 'allergy.update',
  schema: updateAllergySchema,
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

      /*
       * Lê ANTES de gravar para descobrir a qual paciente a linha pertence.
       *
       * O input traz o id da alergia, não o do paciente — e aceitar um
       * `patientId` do cliente deixaria alguém apontar a checagem de
       * duplicidade para outra ficha. Verificar depois de gravar também não
       * serve: não há como desfazer a escrita, porque o valor anterior já foi
       * substituído.
       */
      const current = await repository.findById(context.clinicId, input.allergyId)
      if (!current) return err<Fields>('not-found', allergyMessages.notFound)

      const siblings = await repository.listByPatient(context.clinicId, current.patientId)
      const clash = findSameSubstance(
        siblings.filter((entry) => entry.id !== current.id),
        input.substance,
      )
      if (clash) return err<Fields>('conflict', allergyMessages.duplicate)

      const updated = await repository.update(context.clinicId, input.allergyId, {
        substance: input.substance,
        reaction: input.reaction,
      })
      return ok(toAllergyDto(updated))
    } catch (cause) {
      return toAllergyFailure<Fields>('allergy.update', cause)
    }
  },
  audit: (output) => ({
    action: 'allergy.updated',
    entityType: 'allergy',
    entityId: output.id,
    after: { patient_id: output.patientId, substance: output.substance },
  }),
})

export async function updateAllergyAction(
  rawInput: unknown,
): Promise<ActionResult<AllergyDto, Fields>> {
  return runUpdateAllergy(rawInput)
}
