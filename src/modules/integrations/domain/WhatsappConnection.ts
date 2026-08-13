/**
 * Conexão do canal de WhatsApp da clínica.
 *
 * # O QR code é credencial, não imagem
 *
 * Quem fotografa o código pareia o WhatsApp da clínica com a instância — e passa
 * a mandar mensagem em nome dela. Por isso ele **nunca é persistido**: vive na
 * resposta da action, atravessa para a tela e expira sozinho em segundos. Gravar
 * em banco ou em log seria guardar uma chave de acesso ao canal.
 *
 * Pelo mesmo motivo ele não entra em `audit_log`: o evento registra que alguém
 * pediu conexão, não o código que apareceu na tela.
 */

/**
 * Os três estados que importam para quem opera a clínica.
 *
 * Espelha o `state` da Evolution API sem copiá-lo: `connecting` do provedor
 * significa "há um QR esperando leitura", e é isso que a recepção precisa
 * entender. Traduzir aqui evita que o vocabulário de um fornecedor vaze para a
 * tela — e permite trocar de provedor sem reescrever a interface.
 */
export type WhatsappConnectionState =
  /** Sem instância, ou desconectado do aparelho. */
  | 'disconnected'
  /** Instância de pé, aguardando alguém ler o QR. */
  | 'awaiting_scan'
  /** Pareado: o canal está operante. */
  | 'connected'

export interface WhatsappConnection {
  /** Nome da instância no provedor. Vem da credencial, não do cliente. */
  instanceName: string
  state: WhatsappConnectionState
  /**
   * Imagem do QR em data URI, quando há um a mostrar.
   *
   * Null em `connected` (não há o que parear) e em `disconnected` (ninguém
   * pediu conexão ainda).
   */
  qrCode: string | null
  /** Número pareado, quando o provedor o informa. */
  phoneNumber: string | null
}

/** O que o provedor devolve quando aceita uma mensagem para envio. */
export interface WhatsappSendResult {
  /** Id da mensagem no provedor, para casar o recibo de entrega depois. */
  providerMessageId: string | null
}

/**
 * PORTA do provedor de WhatsApp.
 *
 * Existe para que a Evolution API seja um detalhe substituível: `zapi` e
 * `cloud_api` já estão no enum `channel_provider` do banco, e nenhum deles deve
 * exigir mudança em action ou tela.
 */
export interface WhatsappGateway {
  /**
   * Envia texto para um número.
   *
   * # Esta porta NÃO decide se a mensagem pode ser enviada
   *
   * Ela transporta. Quem decide é a camada acima: se há conversa aberta, se o
   * paciente não pediu para parar, se o horário permite. Misturar as duas
   * responsabilidades faria a regra viajar junto com o adapter, e trocar de
   * provedor passaria a exigir reescrever a política de contato.
   */
  sendText(
    instanceName: string,
    phone: string,
    text: string,
  ): Promise<WhatsappSendResult>
  /**
   * Garante a instância no provedor e devolve o QR quando houver.
   *
   * Idempotente por desenho: chamada com a instância já criada, ela pede um QR
   * novo em vez de falhar. Quem clica "conectar" duas vezes está pedindo outro
   * código, não relatando um erro.
   */
  connect(instanceName: string): Promise<WhatsappConnection>

  /** Estado atual, sem criar nada. É o que o polling da tela consulta. */
  status(instanceName: string): Promise<WhatsappConnection>

  /**
   * Desfaz o pareamento no provedor, mantendo a instância.
   *
   * Separado de "apagar a instância": desconectar é operação de rotina (trocar
   * o aparelho da recepção), apagar destrói o histórico da instância no
   * provedor e não é o que a tela oferece.
   */
  disconnect(instanceName: string): Promise<void>
}

/** Erros que a tela precisa distinguir. */
export type WhatsappGatewayReason =
  /** Credencial da Evolution ausente ou incompleta no cofre da clínica. */
  | 'not-configured'
  /** O provedor recusou a chave. */
  | 'unauthorized'
  /** Não foi possível falar com o provedor. */
  | 'unavailable'
  | 'unexpected'

export class WhatsappGatewayError extends Error {
  constructor(
    readonly reason: WhatsappGatewayReason,
    message: string,
  ) {
    super(message)
    this.name = 'WhatsappGatewayError'
  }
}

export function isWhatsappGatewayError(
  value: unknown,
): value is WhatsappGatewayError {
  return value instanceof WhatsappGatewayError
}
