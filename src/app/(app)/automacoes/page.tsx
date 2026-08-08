import type { Metadata } from 'next'
import { connection } from 'next/server'

import { getIntegrationRepository } from '@/modules/integrations/infrastructure/repository'
import { AutomacoesScreen } from '@/modules/integrations/ui/AutomacoesScreen'

export const metadata: Metadata = {
  title: 'Automações',
  description: 'Regras cadastradas e o que falta para executá-las.',
}

export const instant = false

export default async function AutomacoesPage() {
  await connection()

  const source = await getIntegrationRepository()
  const overview = await source.repository.overview(source.clinicId)

  return <AutomacoesScreen status={overview.automations} />
}
