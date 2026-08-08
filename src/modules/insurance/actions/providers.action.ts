'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toInsuranceFailure } from '../application/insuranceFailure'
import { toPlanDto, toProviderDto } from '../application/toInsuranceDto'
import { insuranceRepositoryFor } from '../infrastructure/repository'
import {
  createPlanSchema,
  createProviderSchema,
  insuranceMessages,
  setProviderActiveSchema,
  type CreatePlanInput,
  type CreateProviderInput,
  type PlanDto,
  type ProviderDto,
  type SetProviderActiveInput,
} from '../schemas/insurance.schema'

/**
 * Operadoras e planos — feature **V-01**.
 *
 * As três operações moram juntas porque são o mesmo cadastro: sem operadora não
 * há plano, e sem plano não há carteirinha nem guia. Todas exigem
 * `insurance.manage` — `owner`, `admin` e `finance` pela matriz de I-05.
 */

const messages = {
  forbidden: insuranceMessages.forbidden,
  validation: insuranceMessages.invalidFields,
  unavailable: insuranceMessages.unavailable,
  unexpected: insuranceMessages.unexpected,
}

const runCreateProvider = createAction<CreateProviderInput, ProviderDto, 'name'>(
  {
    name: 'insurance.createProvider',
    schema: createProviderSchema,
    roles: rolesWith('insurance.manage'),
    messages,
    revalidatePaths: ['/convenios'],

    handler: async (input, context) => {
      const repository = insuranceRepositoryFor(context.supabase)

      try {
        const provider = await repository.createProvider(context.clinicId, {
          name: input.name,
          ansCode: input.ansCode,
          cnpj: input.cnpj,
          notes: input.notes,
        })

        return ok<ProviderDto>(toProviderDto(provider))
      } catch (cause) {
        return toInsuranceFailure<'name'>('insurance.createProvider', cause)
      }
    },

    /** Cadastro de empresa — não há dado de paciente aqui. */
    audit: (output) => ({
      action: 'insurance_provider.created',
      entityType: 'insurance_provider',
      entityId: output.id,
      after: { name: output.name, ans_code: output.ansCode },
    }),
  },
)

export async function createProviderAction(
  rawInput: unknown,
): Promise<ActionResult<ProviderDto, 'name'>> {
  return runCreateProvider(rawInput)
}

const runSetProviderActive = createAction<
  SetProviderActiveInput,
  ProviderDto,
  'providerId'
>({
  name: 'insurance.setProviderActive',
  schema: setProviderActiveSchema,
  roles: rolesWith('insurance.manage'),
  messages,
  revalidatePaths: ['/convenios'],

  handler: async (input, context) => {
    const repository = insuranceRepositoryFor(context.supabase)

    try {
      const provider = await repository.setProviderActive(
        context.clinicId,
        input.providerId,
        input.isActive,
      )

      return ok<ProviderDto>(toProviderDto(provider))
    } catch (cause) {
      return toInsuranceFailure<'providerId'>(
        'insurance.setProviderActive',
        cause,
      )
    }
  },

  audit: (output) => ({
    action: 'insurance_provider.status_changed',
    entityType: 'insurance_provider',
    entityId: output.id,
    after: { is_active: output.isActive },
  }),
})

export async function setProviderActiveAction(
  rawInput: unknown,
): Promise<ActionResult<ProviderDto, 'providerId'>> {
  return runSetProviderActive(rawInput)
}

const runCreatePlan = createAction<
  CreatePlanInput,
  PlanDto,
  'name' | 'providerId' | 'copay' | 'paymentTermDays'
>({
  name: 'insurance.createPlan',
  schema: createPlanSchema,
  roles: rolesWith('insurance.manage'),
  messages,
  revalidatePaths: ['/convenios'],

  handler: async (input, context) => {
    const repository = insuranceRepositoryFor(context.supabase)

    try {
      const plan = await repository.createPlan(context.clinicId, {
        providerId: input.providerId,
        name: input.name,
        planCode: input.planCode,
        copayCents: input.copay,
        paymentTermDays: input.paymentTermDays,
      })

      return ok<PlanDto>(toPlanDto(plan))
    } catch (cause) {
      return toInsuranceFailure<
        'name' | 'providerId' | 'copay' | 'paymentTermDays'
      >('insurance.createPlan', cause)
    }
  },

  audit: (output) => ({
    action: 'insurance_plan.created',
    entityType: 'insurance_plan',
    entityId: output.id,
    after: {
      name: output.name,
      copay_cents: output.copayCents,
      payment_term_days: output.paymentTermDays,
    },
  }),
})

export async function createPlanAction(
  rawInput: unknown,
): Promise<
  ActionResult<PlanDto, 'name' | 'providerId' | 'copay' | 'paymentTermDays'>
> {
  return runCreatePlan(rawInput)
}
