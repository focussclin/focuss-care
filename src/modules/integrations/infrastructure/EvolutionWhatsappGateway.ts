import 'server-only'

import {
  WhatsappGatewayError,
  type WhatsappConnection,
  type WhatsappConnectionState,
  type WhatsappGateway,
  type WhatsappSendResult,
} from '../domain/WhatsappConnection'

/**
 * Adapter da Evolution API — verificado contra a v2.3.7.
 *
 * # O que foi conferido no provedor real, e não suposto
 *
 *  - `POST /instance/create` devolve `qrcode.base64` já como data URI de PNG, e
 *    `instance.status: 'connecting'`.
 *  - `GET /instance/connect/{nome}` devolve `{ code, base64, pairingCode }` —
 *    é o caminho para renovar o QR de uma instância que já existe.
 *  - `GET /instance/connectionState/{nome}` devolve
 *    `{ instance: { instanceName, state } }`, com `state` em
 *    `connecting | open | close`.
 *
 * A v1 usava outras rotas e outro formato. Se o servidor for atualizado ou
 * trocado, é aqui que a mudança para — nem o domínio nem a tela a enxergam.
 */

interface EvolutionCredentials {
  baseUrl: string
  apiKey: string
  instanceName: string
}

/** `open` é o único estado em que a clínica realmente fala com alguém. */
function toState(raw: unknown): WhatsappConnectionState {
  switch (raw) {
    case 'open':
      return 'connected'
    case 'connecting':
      return 'awaiting_scan'
    default:
      return 'disconnected'
  }
}

/**
 * O número pareado vem como JID (`5511999999999@s.whatsapp.net`).
 *
 * A tela mostra número, não endereço de protocolo — e o `@` para trás é o que
 * distingue um do outro.
 */
function toPhoneNumber(jid: unknown): string | null {
  if (typeof jid !== 'string' || !jid.includes('@')) return null

  const [number] = jid.split('@')
  return number && /^\d{8,15}$/.test(number) ? number : null
}

function pick(source: unknown, ...path: string[]): unknown {
  let current: unknown = source

  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }

  return current
}

/** Data URI de PNG — o que a tela consegue pôr num `<img>` sem tratamento. */
function toQrCode(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null

  return value.startsWith('data:image/') ? value : `data:image/png;base64,${value}`
}

export class EvolutionWhatsappGateway implements WhatsappGateway {
  constructor(private readonly credentials: EvolutionCredentials) {}

  async connect(instanceName: string): Promise<WhatsappConnection> {
    /*
     * "Desconectado" tem DUAS causas, e elas exigem caminhos opostos.
     *
     * A instância pode não existir (primeira conexão da clínica) ou existir e
     * estar fechada — o provedor responde `state: 'close'` quando o aparelho
     * foi desligado ou o pareamento caiu. Nos dois casos o domínio diz
     * `disconnected`, mas mandar `/instance/create` para uma instância que já
     * existe é recusado pelo provedor, e a pessoa leria "erro" quando só
     * precisava de um QR novo.
     *
     * Quem separa os dois é a EXISTÊNCIA da instância, não o estado dela: 404
     * no `connectionState` significa que não há nada criado.
     */
    const probe = await this.request(
      'GET',
      `/instance/connectionState/${encodeURIComponent(instanceName)}`,
      undefined,
      { notFoundIsAbsent: true },
    )

    if (probe !== null) {
      const state = toState(pick(probe, 'instance', 'state'))

      if (state === 'connected') {
        // O estado já veio no `probe`; chamar `status()` aqui repetiria a mesma
        // consulta só para reler o que está em mãos.
        return {
          instanceName,
          state: 'connected',
          qrCode: null,
          phoneNumber: await this.ownerNumber(instanceName),
        }
      }

      // Existe e não está pareada: renova o código, sem recriar nada.
      return this.refreshQr(instanceName)
    }

    const created = await this.request('POST', '/instance/create', {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    })

    const qrCode = toQrCode(pick(created, 'qrcode', 'base64'))

    return {
      instanceName,
      // Instância recém-criada com QR na mão está, por definição, esperando
      // leitura — mesmo que o provedor ainda relate `connecting`.
      state: qrCode ? 'awaiting_scan' : toState(pick(created, 'instance', 'status')),
      qrCode,
      phoneNumber: null,
    }
  }

  async status(instanceName: string): Promise<WhatsappConnection> {
    /*
     * Instância inexistente **não é erro**: é o estado inicial de toda clínica
     * que nunca conectou. O provedor responde 404, e traduzir isso para falha
     * faria a tela mostrar erro vermelho antes do primeiro clique.
     */
    const state = await this.request(
      'GET',
      `/instance/connectionState/${encodeURIComponent(instanceName)}`,
      undefined,
      { notFoundIsAbsent: true },
    )

    if (state === null) {
      return { instanceName, state: 'disconnected', qrCode: null, phoneNumber: null }
    }

    const connection = toState(pick(state, 'instance', 'state'))

    return {
      instanceName,
      state: connection,
      qrCode: null,
      phoneNumber:
        connection === 'connected' ? await this.ownerNumber(instanceName) : null,
    }
  }

  /**
   * Envia texto pela instância da clínica.
   *
   * `number` vai só com dígitos: a Evolution aceita JID completo, mas montá-lo
   * aqui exigiria adivinhar o domínio (`@s.whatsapp.net` para pessoa,
   * `@g.us` para grupo) — e errar isso manda a mensagem para o lugar errado.
   * Com dígitos, o provedor resolve.
   */
  async sendText(
    instanceName: string,
    phone: string,
    text: string,
  ): Promise<WhatsappSendResult> {
    const digits = phone.replace(/\D/g, '')

    if (digits.length < 8) {
      throw new WhatsappGatewayError(
        'unexpected',
        'numero de destino invalido para envio',
      )
    }

    const sent = await this.request(
      'POST',
      `/message/sendText/${encodeURIComponent(instanceName)}`,
      { number: digits, text },
    )

    const id = pick(sent, 'key', 'id')

    return { providerMessageId: typeof id === 'string' ? id : null }
  }

  async disconnect(instanceName: string): Promise<void> {
    await this.request(
      'DELETE',
      `/instance/logout/${encodeURIComponent(instanceName)}`,
      undefined,
      { notFoundIsAbsent: true },
    )
  }

  /** Renova o QR de uma instância que já existe. */
  private async refreshQr(instanceName: string): Promise<WhatsappConnection> {
    const connected = await this.request(
      'GET',
      `/instance/connect/${encodeURIComponent(instanceName)}`,
    )

    return {
      instanceName,
      state: 'awaiting_scan',
      qrCode: toQrCode(pick(connected, 'base64') ?? pick(connected, 'qrcode', 'base64')),
      phoneNumber: null,
    }
  }

  /**
   * O número pareado sai de `fetchInstances`, e é best-effort.
   *
   * `connectionState` não o traz. Um canal conectado sem número exibido é uma
   * imperfeição de tela; derrubar a leitura do estado por causa dele esconderia
   * a informação que importa — que o canal está no ar.
   */
  private async ownerNumber(instanceName: string): Promise<string | null> {
    try {
      const instances = await this.request('GET', '/instance/fetchInstances')
      if (!Array.isArray(instances)) return null

      for (const entry of instances) {
        const name = pick(entry, 'name') ?? pick(entry, 'instance', 'instanceName')
        if (name !== instanceName) continue

        return toPhoneNumber(
          pick(entry, 'ownerJid') ?? pick(entry, 'instance', 'owner'),
        )
      }
    } catch {
      return null
    }

    return null
  }

  private async request(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    options: { notFoundIsAbsent?: boolean } = {},
  ): Promise<unknown> {
    const url = `${this.credentials.baseUrl.replace(/\/+$/, '')}${path}`

    let response: Response
    try {
      response = await fetch(url, {
        method,
        headers: {
          apikey: this.credentials.apiKey,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        // O provedor é externo e a tela espera: sem teto, uma instância travada
        // seguraria o request do usuário até o limite da plataforma.
        signal: AbortSignal.timeout(20_000),
      })
    } catch (cause) {
      throw new WhatsappGatewayError(
        'unavailable',
        `falha de rede ao falar com o provedor: ${
          cause instanceof Error ? cause.name : 'desconhecida'
        }`,
      )
    }

    if (response.status === 404 && options.notFoundIsAbsent) return null

    if (response.status === 401 || response.status === 403) {
      throw new WhatsappGatewayError(
        'unauthorized',
        'o provedor recusou a chave configurada',
      )
    }

    if (!response.ok) {
      /*
       * O CORPO do erro não é repassado adiante.
       *
       * A Evolution ecoa o payload enviado nas mensagens de erro, e o payload
       * carrega a chave da instância. O código HTTP basta para a tela decidir o
       * que dizer.
       */
      throw new WhatsappGatewayError(
        'unexpected',
        `o provedor respondeu ${response.status}`,
      )
    }

    try {
      return (await response.json()) as unknown
    } catch {
      return null
    }
  }
}
