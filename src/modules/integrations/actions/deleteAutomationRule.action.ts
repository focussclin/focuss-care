'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toAutomationFailure } from '../application/automationFailure'
import { automationRepositoryFor } from '../infrastructure/automation-repository'
import {
  automationMessages,
  deleteAutomationRuleSchema,
  type DeleteAutomationRuleInput,
} from '../schemas/automation.schema'

type Fields = 'ruleId'

/**
 * Exclui a regra — e o banco recusa se houver execução registrada.
 *
 * `workflow_runs` referencia `workflows`, então apagar uma regra com histórico
 * apagaria junto a evidência do que rodou. Hoje não existe execução nenhuma
 * porque não existe executor, mas a recusa (`23503`) já é traduzida: quando
 * houver, a saída certa é desativar, e a mensagem diz isso em vez de deixar a
 * pessoa tentando de novo.
 *
 * A auditoria guarda o id porque a linha some — depois do delete não há para
 * onde voltar e olhar.
 */
const runDeleteAutomationRule = createAction<
  DeleteAutomationRuleInput,
  { id: string },
  Fields
>({
  name: 'automation_rule.delete',
  schema: deleteAutomationRuleSchema,
  roles: rolesWith('clinic.settings'),
  messages: {
    validation: automationMessages.invalidFields,
    unavailable: automationMessages.unavailable,
    unexpected: automationMessages.unexpected,
  },
  revalidatePaths: ['/automacoes'],
  handler: async (input, context) => {
    try {
      await automationRepositoryFor(context.supabase).deleteRule(
        context.clinicId,
        input.ruleId,
      )
      return ok({ id: input.ruleId })
    } catch (cause) {
      return toAutomationFailure<Fields>('automation_rule.delete', cause)
    }
  },
  audit: (output) => ({
    action: 'automation_rule.deleted',
    entityType: 'workflow',
    entityId: output.id,
  }),
})

export async function deleteAutomationRuleAction(
  rawInput: unknown,
): Promise<ActionResult<{ id: string }, Fields>> {
  return runDeleteAutomationRule(rawInput)
}
