import type { Metadata } from 'next'
import { connection } from 'next/server'

import { getIntegrationRepository } from '@/modules/integrations/infrastructure/repository'
import { WhatsappScreen } from '@/modules/integrations/ui/WhatsappScreen'

export const metadata: Metadata = {
  title: 'WhatsApp',
  description: 'Estado do canal de WhatsApp da clínica.',
}

export default async function WhatsappPage() {
  await connection()

  const source = await getIntegrationRepository()
  const overview = await source.repository.overview(source.clinicId)

  return <WhatsappScreen status={overview.whatsapp} />
}
