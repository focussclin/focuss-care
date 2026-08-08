'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toBillingFailure } from '../application/billingFailure'
import { toPayableDto } from '../application/toBillingDto'
import { billingRepositoryFor } from '../infrastructure/repository'
import {
  billingMessages,
  createPayableSchema,
  type CreatePayableInput,
  type PayableDto,
} from '../schemas/billing.schema'

type Field = 'description' | 'amount' | 'dueDate'

const runCreatePayable = createAction<CreatePayableInput, PayableDto, Field>({
  name: 'payable.create',
  schema: createPayableSchema,
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
      const payable = await billingRepositoryFor(context.supabase).createPayable(
        context.clinicId,
        {
          description: input.description,
          category: input.category,
          supplier: input.supplier,
          amountCents: input.amount,
          dueDate: input.dueDate,
          isRecurring: input.isRecurring,
          notes: input.notes,
        },
        context.userId,
      )

      return ok<PayableDto>(toPayableDto(payable))
    } catch (cause) {
      return toBillingFailure<Field>('payable.create', cause)
    }
  },

  audit: (output) => ({
    action: 'payable.created',
    entityType: 'payable',
    entityId: output.id,
    after: {
      amount_cents: output.amountCents,
      due_date: output.dueDate,
      is_recurring: output.isRecurring,
    },
  }),
})

export async function createPayableAction(
  rawInput: unknown,
): Promise<ActionResult<PayableDto, Field>> {
  return runCreatePayable(rawInput)
}
