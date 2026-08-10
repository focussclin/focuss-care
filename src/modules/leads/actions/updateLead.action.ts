'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toLeadFailure } from '../application/leadFailure'
import { toLeadDto } from '../application/toLeadDto'
import { leadRepositoryFor } from '../infrastructure/repository'
import {
  leadMessages,
  type LeadDto,
  type UpdateLeadInput,
  updateLeadSchema,
} from '../schemas/lead.schema'

type Fields =
  | 'leadId'
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

const runUpdateLead = createAction<UpdateLeadInput, LeadDto, Fields>({
  name: 'lead.update',
  schema: updateLeadSchema,
  roles: rolesWith('team.read'),
  messages: {
    validation: leadMessages.invalidFields,
    unavailable: leadMessages.unavailable,
    unexpected: leadMessages.unexpected,
  },
  revalidatePaths: ['/crm'],
  handler: async (input, context) => {
    try {
      const lead = await leadRepositoryFor(context.supabase).update(
        context.clinicId,
        input.leadId,
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
      return toLeadFailure<Fields>('lead.update', cause)
    }
  },
  audit: (output) => ({
    action: 'lead.updated',
    entityType: 'lead',
    entityId: output.id,
    after: { stage: output.stage, assigned_to: output.assignedTo?.id ?? null },
  }),
})

export async function updateLeadAction(
  rawInput: unknown,
): Promise<ActionResult<LeadDto, Fields>> {
  return runUpdateLead(rawInput)
}
