'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toInsuranceFailure } from '../application/insuranceFailure'
import { toPatientInsuranceRecordDto } from '../application/toInsuranceDto'
import { insuranceRepositoryFor } from '../infrastructure/repository'
import {
  createPatientInsuranceSchema,
  insuranceMessages,
  setPatientInsuranceActiveSchema,
  type CreatePatientInsuranceInput,
  type PatientInsuranceRecordDto,
  type SetPatientInsuranceActiveInput,
} from '../schemas/insurance.schema'

const messages = {
  forbidden: insuranceMessages.forbidden,
  validation: insuranceMessages.invalidFields,
  unavailable: insuranceMessages.unavailable,
  unexpected: insuranceMessages.unexpected,
  'not-found': insuranceMessages.notFound,
}

const runCreatePatientInsurance = createAction<
  CreatePatientInsuranceInput,
  PatientInsuranceRecordDto,
  'patientId' | 'planId' | 'cardNumber' | 'holderName' | 'validUntil' | 'isPrimary'
>({
  name: 'insurance.createPatientInsurance',
  schema: createPatientInsuranceSchema,
  roles: rolesWith('insurance.manage'),
  messages,
  revalidatePaths: ['/convenios'],
  handler: async (input, context) => {
    try {
      const insurance = await insuranceRepositoryFor(context.supabase).createPatientInsurance(
        context.clinicId,
        {
          patientId: input.patientId,
          planId: input.planId,
          cardNumber: input.cardNumber,
          holderName: input.holderName,
          validUntil: input.validUntil ? new Date(`${input.validUntil}T00:00:00`) : null,
          isPrimary: input.isPrimary,
        },
      )

      return ok<PatientInsuranceRecordDto>(toPatientInsuranceRecordDto(insurance))
    } catch (cause) {
      return toInsuranceFailure<
        'patientId' | 'planId' | 'cardNumber' | 'holderName' | 'validUntil' | 'isPrimary'
      >('insurance.createPatientInsurance', cause)
    }
  },
  audit: (output) => ({
    action: 'patient_insurance.created',
    entityType: 'patient_insurance',
    entityId: output.id,
    after: {
      is_primary: output.isPrimary,
      has_valid_until: output.validUntil !== null,
    },
  }),
})

export async function createPatientInsuranceAction(
  rawInput: unknown,
): Promise<
  ActionResult<
    PatientInsuranceRecordDto,
    'patientId' | 'planId' | 'cardNumber' | 'holderName' | 'validUntil' | 'isPrimary'
  >
> {
  return runCreatePatientInsurance(rawInput)
}

const runSetPatientInsuranceActive = createAction<
  SetPatientInsuranceActiveInput,
  PatientInsuranceRecordDto,
  'insuranceId'
>({
  name: 'insurance.setPatientInsuranceActive',
  schema: setPatientInsuranceActiveSchema,
  roles: rolesWith('insurance.manage'),
  messages,
  revalidatePaths: ['/convenios'],
  handler: async (input, context) => {
    try {
      const insurance = await insuranceRepositoryFor(
        context.supabase,
      ).setPatientInsuranceActive(
        context.clinicId,
        input.insuranceId,
        input.isActive,
      )

      return ok<PatientInsuranceRecordDto>(toPatientInsuranceRecordDto(insurance))
    } catch (cause) {
      return toInsuranceFailure<'insuranceId'>(
        'insurance.setPatientInsuranceActive',
        cause,
      )
    }
  },
  audit: (output) => ({
    action: 'patient_insurance.status_changed',
    entityType: 'patient_insurance',
    entityId: output.id,
    after: { is_active: output.isActive },
  }),
})

export async function setPatientInsuranceActiveAction(
  rawInput: unknown,
): Promise<ActionResult<PatientInsuranceRecordDto, 'insuranceId'>> {
  return runSetPatientInsuranceActive(rawInput)
}
