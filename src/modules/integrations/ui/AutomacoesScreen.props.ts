import type { AutomationStatus } from '../domain/Integration'
import type {
  AutomationRuleDto,
  AutomationRuleFormValues,
} from '../schemas/automation.schema'

export interface AutomacoesScreenProps {
  status: AutomationStatus
  rules: readonly AutomationRuleDto[]
  onSubmitRule: (
    values: AutomationRuleFormValues,
    ruleId: string | null,
  ) => Promise<string | null>
  onToggleRule: (ruleId: string, isActive: boolean) => Promise<string | null>
  onDeleteRule: (ruleId: string) => Promise<string | null>
  /** Papel com `clinic.settings` numa clínica conectada. */
  canMutate: boolean
  /** Falha de leitura: a tela diz o que houve em vez de fingir lista vazia. */
  loadError?: string | null
}
