import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'

import {
  deleteAutomationRuleFromScreen,
  submitAutomationRuleFromScreen,
  toggleAutomationRuleFromScreen,
} from '@/modules/integrations/actions/automationScreen.actions'
import { toAutomationRuleDto } from '@/modules/integrations/application/toAutomationDto'
import type { AutomationRuleDetail } from '@/modules/integrations/domain/Automation'
import { isAutomationRepositoryError } from '@/modules/integrations/domain/AutomationRepository'
import { getAutomationRepository } from '@/modules/integrations/infrastructure/automation-repository'
import { getIntegrationRepository } from '@/modules/integrations/infrastructure/repository'
import { automationMessages } from '@/modules/integrations/schemas/automation.schema'
import { AutomacoesScreen } from '@/modules/integrations/ui/AutomacoesScreen'

export const metadata: Metadata = {
  title: 'Automações',
  description: 'Regras cadastradas e o que falta para executá-las.',
}

export default async function AutomacoesPage() {
  await connection()

  const [source, automations, role] = await Promise.all([
    getIntegrationRepository(),
    getAutomationRepository(),
    getActiveClinicRole(),
  ])

  /*
   * A rota não checava papel nenhum.
   *
   * Automação é configuração da clínica: quem define o que dispara para a
   * equipe inteira precisa de `clinic.settings`. Ler exige o mesmo — a regra
   * revela como a clínica opera, e a lista não é dado de atendimento.
   */
  if (source.isLive && !can(role, 'clinic.settings')) forbidden()

  const overview = await source.repository.overview(source.clinicId)

  let rules: AutomationRuleDetail[] = []
  let loadError: string | null = null

  try {
    rules = await automations.repository.listRules(automations.clinicId)
  } catch (cause) {
    if (!isAutomationRepositoryError(cause)) throw cause
    loadError =
      cause.reason === 'forbidden'
        ? automationMessages.forbidden
        : automationMessages.unavailable
  }

  return (
    <AutomacoesScreen
      status={overview.automations}
      rules={rules.map(toAutomationRuleDto)}
      onSubmitRule={submitAutomationRuleFromScreen}
      onToggleRule={toggleAutomationRuleFromScreen}
      onDeleteRule={deleteAutomationRuleFromScreen}
      canMutate={source.isLive && loadError === null}
      loadError={loadError}
    />
  )
}
