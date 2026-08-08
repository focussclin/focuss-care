import 'server-only'

import { redirect } from 'next/navigation'

import { resolveDataSource } from '@/lib/data-source'

import type { IntegrationsOverview } from '../domain/Integration'
import type { IntegrationRepository } from '../domain/IntegrationRepository'
import { SupabaseIntegrationRepository } from './SupabaseIntegrationRepository'

/**
 * Composição das integrações.
 *
 * **Não há adapter Mock**, e a ausência é o desenho correto: o estado de
 * demonstração de uma integração é exatamente "nada conectado", que é o mesmo
 * que o adapter real devolve numa clínica sem canal. Um mock aqui só poderia
 * inventar uma conexão — e um WhatsApp fictício "conectado" é o defeito que esta
 * fatia existe para remover.
 */
const NOTHING_CONNECTED: IntegrationsOverview = {
  whatsapp: { channel: null, conversations: 0, messages: 0, templates: 0 },
  automations: { rules: [], runs: 0 },
  ai: { enabled: false, conversations: 0, requests: 0 },
}

class EmptyIntegrationRepository implements IntegrationRepository {
  async overview(): Promise<IntegrationsOverview> {
    return NOTHING_CONNECTED
  }
}

export async function getIntegrationRepository(): Promise<{
  repository: IntegrationRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseIntegrationRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new EmptyIntegrationRepository(),
    clinicId: source.clinicId,
    isLive: false,
  }
}
