'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toLeadFailure } from '../application/leadFailure'
import { toLeadDto } from '../application/toLeadDto'
import { leadRepositoryFor } from '../infrastructure/repository'
import {
  leadMessages,
  setLeadStageSchema,
  type LeadDto,
  type SetLeadStageInput,
} from '../schemas/lead.schema'

type Fields = 'leadId' | 'stage'

const runSetLeadStage = createAction<SetLeadStageInput, LeadDto, Fields>({
  name: 'lead.setStage',
  schema: setLeadStageSchema,
  roles: rolesWith('team.read'),
  messages: {
    validation: leadMessages.invalidFields,
    unavailable: leadMessages.unavailable,
    unexpected: leadMessages.unexpected,
  },
  revalidatePaths: ['/crm'],
  handler: async (input, context) => {
    try {
      const lead = await leadRepositoryFor(context.supabase).setStage(
        context.clinicId,
        input.leadId,
        context.userId,
        input.stage,
      )
      return ok(toLeadDto(lead))
    } catch (cause) {
      return toLeadFailure<Fields>('lead.setStage', cause)
    }
  },
  audit: (output) => ({
    action: 'lead.stage_changed',
    entityType: 'lead',
    entityId: output.id,
    after: { stage: output.stage },
  }),
})

export async function setLeadStageAction(
  rawInput: unknown,
): Promise<ActionResult<LeadDto, Fields>> {
  return runSetLeadStage(rawInput)
}
