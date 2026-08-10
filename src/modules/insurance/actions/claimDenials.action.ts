'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toClaimDenialDto } from '../application/toInsuranceDto'
import { toInsuranceFailure } from '../application/insuranceFailure'
import { insuranceRepositoryFor } from '../infrastructure/repository'
import {
  createClaimDenialSchema,
  insuranceMessages,
  updateClaimDenialSchema,
  type ClaimDenialDto,
  type CreateClaimDenialInput,
  type UpdateClaimDenialInput,
} from '../schemas/insurance.schema'

const messages = {
  forbidden: insuranceMessages.forbidden,
  validation: insuranceMessages.invalidFields,
  unavailable: insuranceMessages.unavailable,
  unexpected: insuranceMessages.unexpected,
}

const runCreateClaimDenial = createAction<
  CreateClaimDenialInput,
  ClaimDenialDto,
  'invoiceId' | 'reason' | 'amount' | 'deniedAt'
>({
  name: 'insurance.createClaimDenial',
  schema: createClaimDenialSchema,
  roles: rolesWith('insurance.manage'),
  messages,
  revalidatePaths: ['/convenios'],
  handler: async (input, context) => {
    const repository = insuranceRepositoryFor(context.supabase)

    try {
      const denial = await repository.createClaimDenial(
        context.clinicId,
        {
          invoiceId: input.invoiceId,
          denialCode: input.denialCode,
          reason: input.reason,
          amountCents: input.amount,
          deniedAt: parseDateOnly(input.deniedAt),
          notes: input.notes,
        },
        context.userId,
      )

      return ok<ClaimDenialDto>(toClaimDenialDto(denial))
    } catch (cause) {
      return toInsuranceFailure<
        'invoiceId' | 'reason' | 'amount' | 'deniedAt'
      >('insurance.createClaimDenial', cause)
    }
  },
  audit: (output) => ({
    action: 'insurance_claim_denial.created',
    entityType: 'insurance_claim_denial',
    entityId: output.id,
    after: { status: output.status },
  }),
})

export async function createClaimDenialAction(
  rawInput: unknown,
): Promise<
  ActionResult<
    ClaimDenialDto,
    'invoiceId' | 'reason' | 'amount' | 'deniedAt'
  >
> {
  return runCreateClaimDenial(rawInput)
}

const runUpdateClaimDenial = createAction<
  UpdateClaimDenialInput,
  ClaimDenialDto,
  'denialId' | 'recoveredAmount'
>({
  name: 'insurance.updateClaimDenial',
  schema: updateClaimDenialSchema,
  roles: rolesWith('insurance.manage'),
  messages,
  revalidatePaths: ['/convenios'],
  handler: async (input, context) => {
    const repository = insuranceRepositoryFor(context.supabase)

    try {
      const denial = await repository.updateClaimDenial(
        context.clinicId,
        input.denialId,
        input.status === 'recovered'
          ? {
              status: 'recovered',
              recoveredCents: input.recoveredAmount,
              notes: input.notes,
            }
          : { status: input.status, notes: input.notes },
      )

      return ok<ClaimDenialDto>(toClaimDenialDto(denial))
    } catch (cause) {
      return toInsuranceFailure<'denialId' | 'recoveredAmount'>(
        'insurance.updateClaimDenial',
        cause,
      )
    }
  },
  audit: (output) => ({
    action: 'insurance_claim_denial.status_changed',
    entityType: 'insurance_claim_denial',
    entityId: output.id,
    after: { status: output.status },
  }),
})

export async function updateClaimDenialAction(
  rawInput: unknown,
): Promise<ActionResult<ClaimDenialDto, 'denialId' | 'recoveredAmount'>> {
  return runUpdateClaimDenial(rawInput)
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}
