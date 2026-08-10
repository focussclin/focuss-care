import type { AutomationRuleDetail } from '../domain/Automation'
import type { AutomationRuleDto } from '../schemas/automation.schema'

export function toAutomationRuleDto(rule: AutomationRuleDetail): AutomationRuleDto {
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description,
    triggerType: rule.triggerType,
    triggerConfig: rule.triggerConfig,
    conditions: rule.conditions,
    actions: rule.actions,
    isActive: rule.isActive,
    lastRunAt: rule.lastRunAt?.toISOString() ?? null,
    updatedAt: rule.updatedAt.toISOString(),
  }
}
