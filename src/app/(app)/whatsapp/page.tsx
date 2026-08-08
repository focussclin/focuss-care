import type { Metadata } from 'next'
import { connection } from 'next/server'

import { getIntegrationRepository } from '@/modules/integrations/infrastructure/repository'
import { WhatsappScreen } from '@/modules/integrations/ui/WhatsappScreen'

export const metadata: Metadata = {
  title: 'WhatsApp',
  description: 'Estado do canal de WhatsApp da clínica.',
}

/**
 * WhatsApp — estado de conexão (W-01 bloqueada).
 *
 * `instant = false` pela mesma razão das demais rotas de `(app)`: a leitura
 * depende da sessão em cookie, e `cacheComponents` exige shell estático
 * (pendência P-C2).
 */
export const instant = false

export default async function WhatsappPage() {
  await connection()

  const source = await getIntegrationRepository()
  const overview = await source.repository.overview(source.clinicId)

  return <WhatsappScreen status={overview.whatsapp} />
}
