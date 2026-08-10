import type { Metadata } from 'next'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import {
  setMessageTemplateActiveFromScreen,
  submitMessageTemplateFromScreen,
} from '@/modules/integrations/actions/messageTemplateScreen.actions'
import { toMessageTemplateDto } from '@/modules/integrations/application/toMessageTemplateDto'
import type { MessageTemplate } from '@/modules/integrations/domain/MessageTemplate'
import { isMessageTemplateError } from '@/modules/integrations/domain/MessageTemplateRepository'
import { getMessageTemplateSource } from '@/modules/integrations/infrastructure/message-template-repository'
import { getIntegrationRepository } from '@/modules/integrations/infrastructure/repository'
import { messageTemplateMessages } from '@/modules/integrations/schemas/messageTemplate.schema'
import { MessageTemplatesPanel } from '@/modules/integrations/ui/MessageTemplatesPanel'
import { WhatsappScreen } from '@/modules/integrations/ui/WhatsappScreen'

export const metadata: Metadata = {
  title: 'WhatsApp',
  description: 'Estado do canal e modelos de mensagem da clínica.',
}

export default async function WhatsappPage() {
  await connection()

  const [source, templateSource, role] = await Promise.all([
    getIntegrationRepository(),
    getMessageTemplateSource(),
    getActiveClinicRole(),
  ])

  const overview = await source.repository.overview(source.clinicId)

  /*
   * Ler os modelos não exige permissão além do vínculo com a clínica: é o texto
   * que a própria equipe usa, sem dado de paciente. Escrever exige
   * `clinic.settings` — o modelo sai em nome da clínica, e mexer nele muda o
   * que toda a equipe manda.
   */
  const canManageTemplates = can(role, 'clinic.settings')

  let templates: MessageTemplate[] = []
  let templatesError: string | null = null

  try {
    templates = await templateSource.repository.list(templateSource.clinicId)
  } catch (cause) {
    if (!isMessageTemplateError(cause)) throw cause
    templatesError =
      cause.reason === 'forbidden'
        ? messageTemplateMessages.forbidden
        : messageTemplateMessages.unavailable
  }

  return (
    <WhatsappScreen
      status={overview.whatsapp}
      templatesSlot={
        <MessageTemplatesPanel
          templates={templates.map(toMessageTemplateDto)}
          onSubmit={submitMessageTemplateFromScreen}
          onSetActive={setMessageTemplateActiveFromScreen}
          canManage={canManageTemplates}
          isLive={templateSource.isLive}
          loadError={templatesError}
        />
      }
    />
  )
}
