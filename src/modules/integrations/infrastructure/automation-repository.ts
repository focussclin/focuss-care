import 'server-only'

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { AutomationRuleDetail } from '../domain/Automation'
import { AutomationRepositoryError, type AutomationRepository } from '../domain/AutomationRepository'
import { SupabaseAutomationRepository } from './SupabaseAutomationRepository'

/**
 * Demonstração começa sem regra nenhuma, e recusa escrita.
 *
 * Inventar uma automação de exemplo seria mostrar uma regra "ativa" que não
 * existe em lugar nenhum — o mesmo defeito do interruptor falso que esta tela
 * já tinha removido antes.
 */
class EmptyAutomationRepository implements AutomationRepository {
  async listRules(): Promise<AutomationRuleDetail[]> {
    return []
  }

  async createRule(): Promise<AutomationRuleDetail> {
    throw readOnly()
  }

  async updateRule(): Promise<AutomationRuleDetail> {
    throw readOnly()
  }

  async setActive(): Promise<AutomationRuleDetail> {
    throw readOnly()
  }

  async deleteRule(): Promise<void> {
    throw readOnly()
  }
}

function readOnly(): AutomationRepositoryError {
  return new AutomationRepositoryError('unavailable', 'demo repository is read-only')
}

export async function getAutomationRepository(): Promise<{
  repository: AutomationRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseAutomationRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new EmptyAutomationRepository(),
    clinicId: source.clinicId,
    isLive: false,
  }
}

export function automationRepositoryFor(
  client: SupabaseClient<Database>,
): AutomationRepository {
  return new SupabaseAutomationRepository(client)
}
