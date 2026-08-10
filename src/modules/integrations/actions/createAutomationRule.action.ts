'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toAutomationFailure } from '../application/automationFailure'
import { toAutomationRuleDto } from '../application/toAutomationDto'
import { automationRepositoryFor } from '../infrastructure/automation-repository'
import {
  automationMessages,
  createAutomationRuleSchema,
  type AutomationRuleDto,
  type CreateAutomationRuleInput,
} from '../schemas/automation.schema'

type Fields =
  | 'name'
  | 'description'
  | 'triggerType'
  | 'triggerConfig'
  | 'conditions'
  | 'actions'

/**
 * Cadastra a regra. **Ela não passa a executar.**
 *
 * `clinic.settings`, e não `encounter.write`: automação é configuração da
 * clínica. Quem define o que dispara para a equipe inteira é quem administra —
 * a mesma permissão que muda horário de funcionamento e dados da clínica.
 *
 * O que chega aqui já passou por `createAutomationRuleSchema`, que fecha a
 * forma de `triggerConfig`, `conditions` e `actions`. Nenhum JSON do formulário
 * alcança o banco sem essa passagem.
 */
const runCreateAutomationRule = createAction<
  CreateAutomationRuleInput,
  AutomationRuleDto,
  Fields
>({
  name: 'automation_rule.create',
  schema: createAutomationRuleSchema,
  roles: rolesWith('clinic.settings'),
  messages: {
    validation: automationMessages.invalidFields,
    unavailable: automationMessages.unavailable,
    unexpected: automationMessages.unexpected,
  },
  revalidatePaths: ['/automacoes'],
  handler: async (input, context) => {
    try {
      const rule = await automationRepositoryFor(context.supabase).createRule(
        context.clinicId,
        context.userId,
        input,
      )
      return ok(toAutomationRuleDto(rule))
    } catch (cause) {
      return toAutomationFailure<Fields>('automation_rule.create', cause)
    }
  },
  audit: (output) => ({
    action: 'automation_rule.created',
    entityType: 'workflow',
    entityId: output.id,
    after: {
      name: output.name,
      trigger_type: output.triggerType,
      is_active: output.isActive,
    },
  }),
})

export async function createAutomationRuleAction(
  rawInput: unknown,
): Promise<ActionResult<AutomationRuleDto, Fields>> {
  return runCreateAutomationRule(rawInput)
}
