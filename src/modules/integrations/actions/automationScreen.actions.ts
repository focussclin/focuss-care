'use server'

import { createAutomationRuleAction } from './createAutomationRule.action'
import { deleteAutomationRuleAction } from './deleteAutomationRule.action'
import { toggleAutomationRuleAction } from './toggleAutomationRule.action'
import { updateAutomationRuleAction } from './updateAutomationRule.action'
import type { AutomationRuleFormValues } from '../schemas/automation.schema'

export async function submitAutomationRuleFromScreen(
  values: AutomationRuleFormValues,
  ruleId: string | null,
): Promise<string | null> {
  const result = ruleId
    ? await updateAutomationRuleAction({ ruleId, ...values })
    : await createAutomationRuleAction(values)
  return result.ok ? null : result.error.message
}

export async function toggleAutomationRuleFromScreen(
  ruleId: string,
  isActive: boolean,
): Promise<string | null> {
  const result = await toggleAutomationRuleAction({ ruleId, isActive })
  return result.ok ? null : result.error.message
}

export async function deleteAutomationRuleFromScreen(
  ruleId: string,
): Promise<string | null> {
  const result = await deleteAutomationRuleAction({ ruleId })
  return result.ok ? null : result.error.message
}
