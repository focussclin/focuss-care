/**
 * Integrações externas — a base local segura.
 *
 * # O que este módulo é, e o que NÃO é
 *
 * Ele responde a uma pergunta só: **isto está conectado?** Nada aqui envia
 * mensagem, chama modelo de IA ou executa automação. Essas três coisas são
 * W-01, AI-01..07 e AU-01, e as três estão **Blocked** no roadmap — a primeira
 * por falta de worker e provedor, a segunda aguardando a aprovação de
 * `docs/04-agente-ia.md`, a terceira por depender da primeira.
 *
 * # Por que existir antes delas
 *
 * As três telas existiam como vitrine: conversas, respostas de IA e regras de
 * automação escritas no arquivo, com botões desabilitados. Alguém que abrisse
 * `/whatsapp` via um inbox com mensagens — e concluía que o WhatsApp da clínica
 * estava ligado. Nenhuma mensagem sairia dali nunca.
 *
 * Trocar a vitrine por um estado de conexão **lido do banco** custa pouco e
 * corrige a mentira: a tela passa a dizer o que está configurado, o que falta, e
 * quem resolve. Quando W-01 chegar, ela ganha o inbox por cima de uma base que
 * já sabe distinguir "sem canal" de "canal inativo".
 */

/** Espelha o enum `channel_provider` do banco. */
export type ChannelProvider =
  | 'cloud_api'
  | 'evolution'
  | 'zapi'
  | 'twilio'
  | 'other'

/**
 * O estado de uma integração, em três valores que a tela trata diferente.
 *
 *  - `absent` — nada foi cadastrado. É o estado de toda clínica hoje.
 *  - `inactive` — existe cadastro, e ele está desligado.
 *  - `connected` — cadastrado, ativo e com data de conexão.
 *
 * `inactive` não é um detalhe: um canal cadastrado e desligado parece, de longe,
 * exatamente igual a um canal ausente — e a ação para resolver é outra.
 */
export type ConnectionState = 'absent' | 'inactive' | 'connected'

export interface WhatsappChannel {
  id: string
  displayName: string
  /** Guardado como veio. A tela mostra só os últimos dígitos. */
  phoneNumber: string
  provider: ChannelProvider
  state: ConnectionState
  connectedAt: Date | null
}

/**
 * O canal da clínica, e o que existe em cima dele.
 *
 * As contagens vêm de `conversations` e `messages`. Hoje são zero em toda
 * clínica, porque nenhum código do produto grava nessas tabelas — e o zero
 * lido do banco é mais honesto que um número inventado, ou que esconder a
 * seção.
 */
export interface WhatsappStatus {
  channel: WhatsappChannel | null
  conversations: number
  messages: number
  templates: number
}

/** Uma automação cadastrada. **Nada as executa hoje** — ver `workflow_runs`. */
export interface AutomationRule {
  id: string
  name: string
  description: string | null
  triggerType: string
  isActive: boolean
  lastRunAt: Date | null
}

export interface AutomationStatus {
  rules: readonly AutomationRule[]
  /** Execuções registradas em `workflow_runs`. Zero enquanto não há executor. */
  runs: number
}

/**
 * Uso de IA na clínica.
 *
 * Lido de `ai_conversations` e `ai_usage_log`. Nenhuma chamada a provedor de IA
 * sai deste código — a contagem existe para que, no dia em que sair, a tela
 * mostre o que já aconteceu em vez de começar do zero.
 */
export interface AiStatus {
  /** `clinic_settings.ai_enabled`. Hoje sempre falso — C-01 não oferece o botão. */
  enabled: boolean
  conversations: number
  /** Requisições registradas em `ai_usage_log`. */
  requests: number
}

export interface IntegrationsOverview {
  whatsapp: WhatsappStatus
  automations: AutomationStatus
  ai: AiStatus
}
