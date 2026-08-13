/**
 * Contrato do cofre de integrações da clínica.
 *
 * A definição conhece apenas nomes e metadados dos campos. Os valores nunca
 * entram neste módulo em logs, DTOs de leitura ou props server-side.
 */

export const INTEGRATION_CREDENTIAL_DEFINITIONS = [
  {
    provider: 'brevo',
    label: 'Brevo',
    description: 'E-mail transacional e SMTP da clínica.',
    fields: [
      { name: 'apiKey', label: 'API key', type: 'password', required: false },
      { name: 'smtpKey', label: 'Chave SMTP', type: 'password', required: false },
      { name: 'senderEmail', label: 'E-mail remetente', type: 'email', required: false },
    ],
  },
  {
    provider: 'evolution',
    label: 'WhatsApp · Evolution API',
    description: 'Conexão do canal de WhatsApp da clínica.',
    fields: [
      { name: 'baseUrl', label: 'URL da API', type: 'url', required: true },
      { name: 'apiKey', label: 'API key', type: 'password', required: true },
      { name: 'instanceName', label: 'Nome da instância', type: 'text', required: true },
    ],
  },
  {
    provider: 'openai',
    label: 'OpenAI',
    description:
      'Provedor de IA do atendimento automático no WhatsApp e dos recursos que forem habilitados.',
    fields: [
      { name: 'apiKey', label: 'API key', type: 'password', required: true },
      /*
       * O modelo é da CLÍNICA, não do código.
       *
       * Fixá-lo numa constante obrigaria um deploy a cada troca — e a escolha
       * entre um modelo mais barato e um mais capaz é decisão de quem paga a
       * conta. Vazio cai no padrão da aplicação.
       */
      { name: 'model', label: 'Modelo (opcional)', type: 'text', required: false },
    ],
  },
  {
    provider: 'deepseek',
    label: 'DeepSeek',
    description: 'Provedor de IA alternativo, para clínicas que já o usem.',
    fields: [
      { name: 'apiKey', label: 'API key', type: 'password', required: true },
      { name: 'baseUrl', label: 'URL base (opcional)', type: 'url', required: false },
    ],
  },
  {
    provider: 'google_calendar',
    label: 'Google Calendar',
    description: 'Sincronização opcional da agenda com o Google.',
    fields: [
      { name: 'clientId', label: 'Client ID', type: 'text', required: true },
      { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
      { name: 'redirectUri', label: 'URL de callback', type: 'url', required: true },
    ],
  },
  {
    provider: 'outlook_calendar',
    label: 'Outlook Calendar',
    description: 'Sincronização opcional via Microsoft Graph.',
    fields: [
      { name: 'clientId', label: 'Client ID', type: 'text', required: true },
      { name: 'clientSecret', label: 'Client Secret', type: 'password', required: true },
      { name: 'tenantId', label: 'Tenant ID', type: 'text', required: true },
      { name: 'redirectUri', label: 'URL de callback', type: 'url', required: true },
    ],
  },
] as const

export type IntegrationCredentialProvider =
  (typeof INTEGRATION_CREDENTIAL_DEFINITIONS)[number]['provider']

export type IntegrationCredentialValues = Record<string, string>

export interface IntegrationCredentialStatus {
  provider: IntegrationCredentialProvider
  label: string
  configured: boolean
  updatedAt: string | null
}

export type IntegrationCredentialStoreState =
  | 'ready'
  | 'schema-not-ready'
  | 'unavailable'
  | 'demo'

export interface IntegrationCredentialOverview {
  statuses: readonly IntegrationCredentialStatus[]
  storeState: IntegrationCredentialStoreState
}

export function emptyIntegrationCredentialStatuses(): IntegrationCredentialStatus[] {
  return INTEGRATION_CREDENTIAL_DEFINITIONS.map(({ provider, label }) => ({
    provider,
    label,
    configured: false,
    updatedAt: null,
  }))
}

export function statusForProvider(
  provider: IntegrationCredentialProvider,
  updatedAt: string,
): IntegrationCredentialStatus {
  const definition = INTEGRATION_CREDENTIAL_DEFINITIONS.find(
    (item) => item.provider === provider,
  )

  return {
    provider,
    label: definition?.label ?? provider,
    configured: true,
    updatedAt,
  }
}
