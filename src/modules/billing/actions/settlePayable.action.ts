'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toBillingFailure } from '../application/billingFailure'
import { toPayableDto } from '../application/toBillingDto'
import { billingRepositoryFor } from '../infrastructure/repository'
import {
  billingMessages,
  settlePayableSchema,
  type PayableDto,
  type SettlePayableInput,
} from '../schemas/billing.schema'

type Field = 'method'

const runSettlePayable = createAction<SettlePayableInput, PayableDto, Field>({
  name: 'payable.settle',
  schema: settlePayableSchema,
  roles: rolesWith('payable.write'),
  messages: {
    forbidden: billingMessages.forbidden,
    validation: billingMessages.invalidFields,
    unavailable: billingMessages.unavailable,
    unexpected: billingMessages.unexpected,
  },
  revalidatePaths: ['/financeiro'],

  handler: async (input, context) => {
    try {
      const payable = await billingRepositoryFor(context.supabase).settlePayable(
        context.clinicId,
        {
          payableId: input.payableId,
          method: input.method,
        },
      )

      return ok<PayableDto>(toPayableDto(payable))
    } catch (cause) {
      return toBillingFailure<Field>('payable.settle', cause)
    }
  },

  audit: (output, input) => ({
    action: 'payable.settled',
    entityType: 'payable',
    entityId: output.id,
    after: {
      amount_cents: output.paidAmountCents,
      method: input.method,
    },
  }),
})

export async function settlePayableAction(
  rawInput: unknown,
): Promise<ActionResult<PayableDto, Field>> {
  return runSettlePayable(rawInput)
}
