import type { AutomationRuleDetail, NewAutomationRuleData } from './Automation'

export type AutomationRepositoryErrorReason =
  | 'forbidden'
  /**
   * A regra é legível, mas a escrita não alcançou a linha.
   *
   * Distinto de `not-found`. Sem policy de UPDATE/DELETE em `workflows` para o
   * papel, o Postgres não devolve erro: zero linhas mudam, em silêncio. Chamar
   * isso de "não encontrado" mandaria procurar uma regra que está na lista.
   */
  | 'write-forbidden'
  /** `23503` — há `workflow_runs` apontando para a regra. */
  | 'has-runs'
  | 'not-found'
  | 'unavailable'
  | 'unexpected'

export class AutomationRepositoryError extends Error {
  constructor(
    readonly reason: AutomationRepositoryErrorReason,
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'AutomationRepositoryError'
  }
}

export function isAutomationRepositoryError(
  cause: unknown,
): cause is AutomationRepositoryError {
  return cause instanceof AutomationRepositoryError
}

export interface AutomationRepository {
  listRules(clinicId: string): Promise<AutomationRuleDetail[]>
  createRule(
    clinicId: string,
    createdBy: string,
    data: NewAutomationRuleData,
  ): Promise<AutomationRuleDetail>
  updateRule(
    clinicId: string,
    ruleId: string,
    data: NewAutomationRuleData,
  ): Promise<AutomationRuleDetail>
  setActive(
    clinicId: string,
    ruleId: string,
    isActive: boolean,
  ): Promise<AutomationRuleDetail>
  deleteRule(clinicId: string, ruleId: string): Promise<void>
}
