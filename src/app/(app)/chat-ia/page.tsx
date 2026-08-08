import type { Metadata } from 'next'
import { connection } from 'next/server'

import { getIntegrationRepository } from '@/modules/integrations/infrastructure/repository'
import { ChatIaScreen } from '@/modules/integrations/ui/ChatIaScreen'

export const metadata: Metadata = {
  title: 'Assistente com IA',
  description: 'Estado do assistente e a regra que vale antes dele existir.',
}

export const instant = false

export default async function ChatIaPage() {
  await connection()

  const source = await getIntegrationRepository()
  const overview = await source.repository.overview(source.clinicId)

  return <ChatIaScreen status={overview.ai} />
}
