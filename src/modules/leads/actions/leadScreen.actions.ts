'use server'

import { createLeadAction } from './createLead.action'
import { setLeadStageAction } from './setLeadStage.action'
import { updateLeadAction } from './updateLead.action'
import type { LeadFormValues } from '../schemas/lead.schema'

export async function submitLeadFromScreen(
  values: LeadFormValues,
  leadId: string | null,
): Promise<string | null> {
  const result = leadId
    ? await updateLeadAction({ leadId, ...values })
    : await createLeadAction(values)
  return result.ok ? null : result.error.message
}

export async function moveLeadFromScreen(
  leadId: string,
  stage: LeadFormValues['stage'],
): Promise<string | null> {
  const result = await setLeadStageAction({ leadId, stage })
  return result.ok ? null : result.error.message
}
