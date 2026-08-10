'use server'

import { cacheTags } from '@/lib/cache/tags'
import { patientPaths } from '@/lib/routes/patientRoutes'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { patientWriteRoles } from '../application/patientWriteRoles'
import {
  toPatientContactDto,
  type PatientContactDto,
} from '../application/toPatientContactDto'
import { toWriteFailure } from '../application/writeFailure'
import {
  patientContactRepositoryFor,
  patientRepositoryFor,
} from '../infrastructure/repository'
import {
  createPatientContactSchema,
  patientContactMessages,
  type CreatePatientContactInput,
  type PatientContactField,
} from '../schemas/patientContact.schema'

const failureMessages = {
  conflict: patientContactMessages.conflict,
  forbidden: patientContactMessages.forbidden,
  notFound: patientContactMessages.notFound,
  unavailable: patientContactMessages.unavailable,
  unexpected: patientContactMessages.unexpected,
}

const runCreatePatientContact = createAction<
  CreatePatientContactInput,
  PatientContactDto,
  PatientContactField
>({
  name: 'patient.contact.create',
  schema: createPatientContactSchema,
  roles: patientWriteRoles,
  messages: {
    forbidden: patientContactMessages.forbidden,
    validation: 'Revise os dados do contato e tente novamente.',
    unavailable: patientContactMessages.unavailable,
    unexpected: patientContactMessages.unexpected,
    'not-found': patientContactMessages.notFound,
  },
  cacheTags: ({ clinicId }, output) => [
    cacheTags.patient(clinicId, output.patientId),
  ],
  revalidatePaths: (_scope, output) => patientPaths(output.patientId),
  handler: async (input, context) => {
    const patients = patientRepositoryFor(context.supabase)
    const contacts = patientContactRepositoryFor(context.supabase)

    try {
      const patient = await patients.findById(context.clinicId, input.patientId)
      if (!patient) {
        return err<PatientContactField>('not-found', patientContactMessages.notFound)
      }

      const contact = await contacts.create(context.clinicId, patient.id, {
        name: input.name,
        relationship: input.relationship,
        phone: input.phone,
        email: input.email,
        isLegalGuardian: input.isLegalGuardian,
      })

      return ok<PatientContactDto>(toPatientContactDto(contact))
    } catch (cause) {
      return toWriteFailure<PatientContactField>(
        'patient.contact.create',
        cause,
        failureMessages,
      )
    }
  },
  audit: (output) => ({
    action: 'patient.contact.created',
    entityType: 'patient_contact',
    entityId: output.id,
    after: {
      source: 'patient-profile',
      has_phone: output.phone !== null,
      has_email: output.email !== null,
      is_legal_guardian: output.isLegalGuardian,
    },
  }),
})

export async function createPatientContactAction(
  rawInput: unknown,
): Promise<ActionResult<PatientContactDto, PatientContactField>> {
  return runCreatePatientContact(rawInput)
}
