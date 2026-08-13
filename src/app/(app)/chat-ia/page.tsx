import type { Metadata } from 'next'
import { connection } from 'next/server'

import { getIntegrationRepository } from '@/modules/integrations/infrastructure/repository'
import { ChatIaScreen } from '@/modules/integrations/ui/ChatIaScreen'
import { getClinicSettingsRepository } from '@/modules/settings/infrastructure/repository'

export const metadata: Metadata = {
  title: 'Assistente com IA',
  description: 'O que a clínica delega à IA hoje, e o que nunca será delegado.',
}

export default async function ChatIaPage() {
  await connection()

  const source = await getIntegrationRepository()
  const overview = await source.repository.overview(source.clinicId)

  /*
   * O estado do atendimento no WhatsApp, lido de `clinic_settings`.
   *
   * Best-effort: esta tela existe para declarar limites, e ela precisa carregar
   * mesmo que a preferência não venha. Sem a leitura, o padrão é "desligado" —
   * que é o lado seguro do erro, porque anunciar IA ligada quando não está seria
   * pior que o contrário.
   */
  const whatsappAiEnabled = await getClinicSettingsRepository()
    .then((settings) => settings.repository.load(settings.clinicId))
    .then((settings) => settings.aiEnabled)
    .catch(() => false)

  return (
    <ChatIaScreen status={overview.ai} whatsappAiEnabled={whatsappAiEnabled} />
  )
}
