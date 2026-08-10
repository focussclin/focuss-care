'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toAutomationFailure } from '../application/automationFailure'
import { toAutomationRuleDto } from '../application/toAutomationDto'
import { automationRepositoryFor } from '../infrastructure/automation-repository'
import {
  automationMessages,
  updateAutomationRuleSchema,
  type AutomationRuleDto,
  type UpdateAutomationRuleInput,
} from '../schemas/automation.schema'

type Fields =
  | 'ruleId'
  | 'name'
  | 'description'
  | 'triggerType'
  | 'triggerConfig'
  | 'conditions'
  | 'actions'

const runUpdateAutomationRule = createAction<
  UpdateAutomationRuleInput,
  AutomationRuleDto,
  Fields
>({
  name: 'automation_rule.update',
  schema: updateAutomationRuleSchema,
  roles: rolesWith('clinic.settings'),
  messages: {
    validation: automationMessages.invalidFields,
    unavailable: automationMessages.unavailable,
    unexpected: automationMessages.unexpected,
  },
  revalidatePaths: ['/automacoes'],
  handler: async (input, context) => {
    const { ruleId, ...data } = input
    try {
      const rule = await automationRepositoryFor(context.supabase).updateRule(
        context.clinicId,
        ruleId,
        data,
      )
      return ok(toAutomationRuleDto(rule))
    } catch (cause) {
      return toAutomationFailure<Fields>('automation_rule.update', cause)
    }
  },
  audit: (output) => ({
    action: 'automation_rule.updated',
    entityType: 'workflow',
    entityId: output.id,
    after: {
      name: output.name,
      trigger_type: output.triggerType,
      is_active: output.isActive,
    },
  }),
})

export async function updateAutomationRuleAction(
  rawInput: unknown,
): Promise<ActionResult<AutomationRuleDto, Fields>> {
  return runUpdateAutomationRule(rawInput)
}
