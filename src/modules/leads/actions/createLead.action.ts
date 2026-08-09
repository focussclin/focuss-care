'use server'

import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toLeadFailure } from '../application/leadFailure'
import { toLeadDto } from '../application/toLeadDto'
import { leadRepositoryFor } from '../infrastructure/repository'
import {
  createLeadSchema,
  leadMessages,
  type CreateLeadInput,
  type LeadDto,
} from '../schemas/lead.schema'

type Fields =
  | 'name'
  | 'phone'
  | 'email'
  | 'source'
  | 'campaign'
  | 'interest'
  | 'stage'
  | 'potentialValueCents'
  | 'nextActionAt'
  | 'notes'
  | 'assignedToId'

const runCreateLead = createAction<CreateLeadInput, LeadDto, Fields>({
  name: 'lead.create',
  schema: createLeadSchema,
  messages: {
    validation: leadMessages.invalidFields,
    unavailable: leadMessages.unavailable,
    unexpected: leadMessages.unexpected,
  },
  revalidatePaths: ['/crm'],
  handler: async (input, context) => {
    try {
      const lead = await leadRepositoryFor(context.supabase).create(
        context.clinicId,
        context.userId,
        {
          name: input.name,
          phone: input.phone,
          email: input.email,
          source: input.source,
          campaign: input.campaign || null,
          interest: input.interest || null,
          stage: input.stage,
          potentialValueCents: input.potentialValueCents,
          nextActionAt: input.nextActionAt,
          notes: input.notes || null,
          assignedToId: input.assignedToId,
        },
      )
      return ok(toLeadDto(lead))
    } catch (cause) {
      return toLeadFailure<Fields>('lead.create', cause)
    }
  },
  audit: (output) => ({
    action: 'lead.created',
    entityType: 'lead',
    entityId: output.id,
    after: { stage: output.stage, source: output.source },
  }),
})

export async function createLeadAction(
  rawInput: unknown,
): Promise<ActionResult<LeadDto, Fields>> {
  return runCreateLead(rawInput)
}
