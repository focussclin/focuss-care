'use server'

import { cacheTags } from '@/lib/cache/tags'
import { patientPaths } from '@/lib/routes/patientRoutes'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { patientWriteRoles } from '../application/patientWriteRoles'
import { toPatientTagFailure } from '../application/patientTagFailure'
import { patientTagRepositoryFor } from '../infrastructure/repository'
import {
  patientTagMessages,
  removePatientTagSchema,
  type RemovePatientTagInput,
} from '../schemas/patientTag.schema'

type Fields = 'patientId' | 'tagId'
interface RemovedTagDto {
  patientId: string
  tagId: string
}

const runRemovePatientTag = createAction<RemovePatientTagInput, RemovedTagDto, Fields>({
  name: 'patient.tag.remove',
  schema: removePatientTagSchema,
  roles: patientWriteRoles,
  messages: {
    validation: 'A tag selecionada é inválida.',
    forbidden: patientTagMessages.forbidden,
    unavailable: patientTagMessages.unavailable,
    unexpected: patientTagMessages.unexpected,
  },
  cacheTags: ({ clinicId }, output) => [cacheTags.patient(clinicId, output.patientId)],
  revalidatePaths: (_scope, output) => patientPaths(output.patientId),
  handler: async (input, context) => {
    try {
      await patientTagRepositoryFor(context.supabase).removeFromPatient(
        context.clinicId,
        input.patientId,
        input.tagId,
      )
      return ok<RemovedTagDto>(input)
    } catch (cause) {
      return toPatientTagFailure<Fields>('patient.tag.remove', cause)
    }
  },
  audit: (output) => ({
    action: 'patient.tag.removed',
    entityType: 'patient_tag',
    entityId: output.tagId,
    after: { patientId: output.patientId },
  }),
})

export async function removePatientTagAction(
  rawInput: unknown,
): Promise<ActionResult<RemovedTagDto, Fields>> {
  return runRemovePatientTag(rawInput)
}
