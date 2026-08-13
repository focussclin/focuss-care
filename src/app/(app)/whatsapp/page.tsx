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
import { getIntegrationCredentialRepository } from '@/modules/integrations/infrastructure/credentials-repository'
import type { WhatsappConnectionDto } from '@/modules/integrations/schemas/whatsappConnection.schema'
import { AiAssistantPanel } from '@/modules/integrations/ui/AiAssistantPanel'
import { setAiEnabledFromScreen } from '@/modules/settings/actions/setAiEnabled.action'
import { getClinicSettingsRepository } from '@/modules/settings/infrastructure/repository'
import { MessageTemplatesPanel } from '@/modules/integrations/ui/MessageTemplatesPanel'
import { WhatsappConnectionPanel } from '@/modules/integrations/ui/WhatsappConnectionPanel'
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
   * Estar AUTORIZADA e estar CONFIGURADA são coisas diferentes.
   *
   * `aiEnabled` é a decisão da clínica; a credencial da OpenAI é a capacidade.
   * Sem chave, o botão de ligar fica indisponível com a explicação — em vez de
   * ligar um assistente que falharia na primeira mensagem que chegasse.
   *
   * As duas leituras são best-effort: nenhuma delas pode derrubar a tela do
   * canal, que é o que a pessoa veio ver.
   */
  const [aiEnabled, hasOpenAiCredential] = await Promise.all([
    getClinicSettingsRepository()
      .then((settings) => settings.repository.load(settings.clinicId))
      .then((settings) => settings.aiEnabled)
      .catch(() => false),
    getIntegrationCredentialRepository()
      .then((credentials) => credentials.repository.overview(credentials.clinicId))
      .then((credentialOverview) =>
        credentialOverview.statuses.some(
          (status) => status.provider === 'openai' && status.configured,
        ),
      )
      .catch(() => false),
  ])

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

  /*
   * Estado inicial da conexão, lido no SERVIDOR.
   *
   * Sem isto o painel abriria em "desconectado" e só se corrigiria depois da
   * primeira consulta do cliente — quem tem o canal no ar leria, por um
   * instante, que ele está fora. A leitura é do provedor, então não pode
   * derrubar a página: se falhar, a tela abre em desconectado e o botão
   * devolve o erro real.
   */
  let channelConnection: WhatsappConnectionDto = {
    state: 'disconnected',
    qrCode: null,
    phoneNumber: null,
  }

  if (source.isLive && can(role, 'clinic.settings')) {
    const { whatsappStatusAction } = await import(
      '@/modules/integrations/actions/whatsappConnection.action'
    )

    const result = await whatsappStatusAction()
    if (result.ok) channelConnection = result.data
  }

  return (
    <WhatsappScreen
      status={overview.whatsapp}
      connectionSlot={
        can(role, 'clinic.settings') ? (
          <>
            <WhatsappConnectionPanel
              initial={channelConnection}
              canManage
              isLive={source.isLive}
            />
            <AiAssistantPanel
              enabled={aiEnabled}
              hasCredential={hasOpenAiCredential}
              onToggle={setAiEnabledFromScreen}
              canManage
              isLive={source.isLive}
            />
          </>
        ) : null
      }
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
