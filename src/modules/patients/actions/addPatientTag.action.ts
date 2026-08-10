'use server'

import { cacheTags } from '@/lib/cache/tags'
import { patientPaths } from '@/lib/routes/patientRoutes'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { patientWriteRoles } from '../application/patientWriteRoles'
import { toPatientTagDto } from '../application/toPatientTagDto'
import { toPatientTagFailure } from '../application/patientTagFailure'
import { patientRepositoryFor, patientTagRepositoryFor } from '../infrastructure/repository'
import {
  addPatientTagSchema,
  patientTagMessages,
  type AddPatientTagInput,
  type PatientTagDto,
} from '../schemas/patientTag.schema'

type Fields = 'patientId' | 'name' | 'color'
type PatientTagMutationDto = PatientTagDto & { patientId: string }

const runAddPatientTag = createAction<AddPatientTagInput, PatientTagMutationDto, Fields>({
  name: 'patient.tag.add',
  schema: addPatientTagSchema,
  roles: patientWriteRoles,
  messages: {
    validation: 'Revise o nome e a cor da tag.',
    forbidden: patientTagMessages.forbidden,
    unavailable: patientTagMessages.unavailable,
    unexpected: patientTagMessages.unexpected,
  },
  cacheTags: ({ clinicId }, output) => [cacheTags.patient(clinicId, output.patientId)],
  revalidatePaths: (_scope, output) => patientPaths(output.patientId),
  handler: async (input, context) => {
    try {
      const patient = await patientRepositoryFor(context.supabase).findById(
        context.clinicId,
        input.patientId,
      )
      if (!patient) return err<Fields>('not-found', patientTagMessages.notFound)

      const tag = await patientTagRepositoryFor(context.supabase).addToPatient(
        context.clinicId,
        input,
      )
      return ok<PatientTagMutationDto>({ ...toPatientTagDto(tag), patientId: patient.id })
    } catch (cause) {
      return toPatientTagFailure<Fields>('patient.tag.add', cause)
    }
  },
  audit: (output) => ({
    action: 'patient.tag.added',
    entityType: 'patient_tag',
    entityId: output.id,
    after: { patientId: output.patientId, color: output.color },
  }),
})

export async function addPatientTagAction(
  rawInput: unknown,
): Promise<ActionResult<PatientTagMutationDto, Fields>> {
  return runAddPatientTag(rawInput)
}
