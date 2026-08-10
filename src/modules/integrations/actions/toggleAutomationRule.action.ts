'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toAutomationFailure } from '../application/automationFailure'
import { toAutomationRuleDto } from '../application/toAutomationDto'
import { automationRepositoryFor } from '../infrastructure/automation-repository'
import {
  automationMessages,
  toggleAutomationRuleSchema,
  type AutomationRuleDto,
  type ToggleAutomationRuleInput,
} from '../schemas/automation.schema'

type Fields = 'ruleId' | 'isActive'

/**
 * Liga e desliga a regra no banco.
 *
 * Ativar **não faz a regra rodar**: sem executor, `is_active` é uma intenção
 * registrada, e nada mais. A tela diz isso ao lado do interruptor — senão ele
 * volta a ser exatamente o botão falso que esta tela já removeu uma vez, o que
 * mudava de posição e não ligava nada.
 */
const runToggleAutomationRule = createAction<
  ToggleAutomationRuleInput,
  AutomationRuleDto,
  Fields
>({
  name: 'automation_rule.toggle',
  schema: toggleAutomationRuleSchema,
  roles: rolesWith('clinic.settings'),
  messages: {
    validation: automationMessages.invalidFields,
    unavailable: automationMessages.unavailable,
    unexpected: automationMessages.unexpected,
  },
  revalidatePaths: ['/automacoes'],
  handler: async (input, context) => {
    try {
      const rule = await automationRepositoryFor(context.supabase).setActive(
        context.clinicId,
        input.ruleId,
        input.isActive,
      )
      return ok(toAutomationRuleDto(rule))
    } catch (cause) {
      return toAutomationFailure<Fields>('automation_rule.toggle', cause)
    }
  },
  audit: (output) => ({
    action: output.isActive
      ? 'automation_rule.activated'
      : 'automation_rule.deactivated',
    entityType: 'workflow',
    entityId: output.id,
    after: { is_active: output.isActive },
  }),
})

export async function toggleAutomationRuleAction(
  rawInput: unknown,
): Promise<ActionResult<AutomationRuleDto, Fields>> {
  return runToggleAutomationRule(rawInput)
}
