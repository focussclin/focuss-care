import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O webhook do WhatsApp — a única rota do produto que roda sem sessão.
 *
 * Ela não tinha teste, e é a de maior superfície: pública na internet, escreve
 * com o cliente administrativo (que ignora RLS) e responde em nome da clínica.
 * O que este arquivo trava:
 *
 *  1. **A comparação do segredo.** Falhar fechado quando não configurado, e 404
 *     — nunca 401 — quando o segredo não bate.
 *  2. **O tenant do recibo.** `messages.update` escrevia por
 *     `provider_message_id` apenas: o segredo é um só para todas as clínicas,
 *     então o provedor de uma alcançava a linha de outra.
 *  3. **Responder 200 mesmo ignorando.** Erro faz a Evolution reenviar, e
 *     reenvio vira mensagem duplicada para o paciente.
 */

const handleIncomingWhatsapp = vi.fn()
const decryptIntegrationCredentials = vi.fn()
const createSupabaseAdminClient = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => createSupabaseAdminClient(),
}))

vi.mock('@/modules/integrations/infrastructure/whatsapp-inbound', () => ({
  handleIncomingWhatsapp: (...args: unknown[]) => handleIncomingWhatsapp(...args),
}))

vi.mock('@/modules/integrations/infrastructure/integration-vault', () => ({
  decryptIntegrationCredentials: (payload: unknown) =>
    decryptIntegrationCredentials(payload),
}))

const { POST } = await import('./route')

const SECRET = 'segredo-do-webhook'
const INSTANCE = 'clinica-alfa'
const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const OTHER_CLINIC = '1a2b0000-0000-4000-8000-00000000c19f'
const MESSAGE = 'd4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f70'

interface RecordedCall {
  table: string
  method: string
  args: unknown[]
}

/**
 * O duplo do cliente administrativo.
 *
 * Grava a cadeia do supabase-js em vez de falar com o banco: é o único jeito de
 * afirmar que `clinic_id` está nas duas consultas do recibo. **Nenhuma rede.**
 */
function createFakeAdmin(options: {
  credentials?: { clinic_id: string; encrypted_payload: string }[]
  message?: { id: string; status: string } | null
  readError?: { code: string } | null
  updateError?: { code: string } | null
}) {
  const calls: RecordedCall[] = []

  const from = vi.fn((table: string) => {
    const query: Record<string, unknown> = {}

    for (const method of ['select', 'eq', 'update']) {
      query[method] = (...args: unknown[]) => {
        calls.push({ table, method, args })
        return query
      }
    }

    query.maybeSingle = async () => ({
      data: options.readError ? null : (options.message ?? null),
      error: options.readError ?? null,
    })

    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      const payload =
        table === 'clinic_integration_credentials'
          ? { data: options.credentials ?? [], error: null }
          : { data: null, error: options.updateError ?? null }

      return Promise.resolve(payload).then(onFulfilled, onRejected)
    }

    return query
  })

  return {
    calls,
    client: { from },
    ofTable: (table: string) => calls.filter((call) => call.table === table),
  }
}

/**
 * O que o handler realmente usa de `NextRequest`: dois cabeçalhos, a query e o
 * corpo. Campo a mais que ele passe a ler quebra o teste, em vez de passar
 * despercebido.
 */
function request(
  body: unknown,
  options: { secret?: string; viaQuery?: boolean; invalidJson?: boolean } = {},
) {
  const secret = options.secret ?? SECRET
  const url = new URL('https://clinica.exemplo.com.br/api/webhooks/whatsapp')
  if (options.viaQuery) url.searchParams.set('secret', secret)

  return {
    headers: {
      get: (name: string) =>
        name === 'x-webhook-secret' && !options.viaQuery ? secret : null,
    },
    nextUrl: url,
    json: async () => {
      if (options.invalidJson) throw new SyntaxError('corpo não é JSON')
      return body
    },
  } as never
}

function upsert(overrides: Record<string, unknown> = {}) {
  return {
    event: 'messages.upsert',
    instance: INSTANCE,
    data: {
      key: {
        remoteJid: '5511999998888@s.whatsapp.net',
        fromMe: false,
        id: 'PROVIDER-1',
      },
      pushName: 'Marina Costa',
      message: { conversation: 'Bom dia, queria remarcar' },
      ...overrides,
    },
  }
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    event: 'messages.update',
    instance: INSTANCE,
    data: { keyId: 'PROVIDER-1', status: 'DELIVERY_ACK', ...overrides },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.WHATSAPP_WEBHOOK_SECRET = SECRET
  decryptIntegrationCredentials.mockResolvedValue({ instanceName: INSTANCE })
  handleIncomingWhatsapp.mockResolvedValue('answered')
})

const knownInstance = [{ clinic_id: CLINIC, encrypted_payload: 'cifrado' }]

// ---------------------------------------------------------------------------

describe('segredo compartilhado', () => {
  it('sem segredo configurado, recusa tudo — falha fechado', async () => {
    delete process.env.WHATSAPP_WEBHOOK_SECRET

    const response = await POST(request(upsert()))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ignored: 'not-configured' })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('segredo errado devolve 404, e não 401', async () => {
    /*
     * 401 confirmaria que o endpoint existe e que só falta a credencial certa.
     * 404 não convida a insistir.
     */
    const response = await POST(request(upsert(), { secret: 'chute' }))

    expect(response.status).toBe(404)
    expect(handleIncomingWhatsapp).not.toHaveBeenCalled()
  })

  it('segredo de tamanho diferente não passa', async () => {
    const response = await POST(request(upsert(), { secret: SECRET.slice(0, 4) }))

    expect(response.status).toBe(404)
  })

  it('aceita o segredo pela query, para provedor que não manda cabeçalho', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createFakeAdmin({ credentials: knownInstance }).client,
    )

    const response = await POST(request(upsert(), { viaQuery: true }))

    expect(response.status).toBe(200)
    expect(handleIncomingWhatsapp).toHaveBeenCalled()
  })
})

describe('eventos que não viram mensagem', () => {
  beforeEach(() => {
    createSupabaseAdminClient.mockReturnValue(
      createFakeAdmin({ credentials: knownInstance }).client,
    )
  })

  it('corpo inválido é ignorado com 200 — 500 faria a Evolution reenviar', async () => {
    const response = await POST(request(null, { invalidJson: true }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ignored: 'invalid-json' })
  })

  it('evento de outro tipo não abre o banco', async () => {
    const response = await POST(request({ event: 'connection.update' }))

    expect(await response.json()).toEqual({ ignored: 'other-event' })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('mensagem da própria clínica não vira resposta — evita o laço', async () => {
    const response = await POST(
      request(upsert({ key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: true } })),
    )

    expect(await response.json()).toEqual({ ignored: 'own-message' })
    expect(handleIncomingWhatsapp).not.toHaveBeenCalled()
  })

  it('eco da própria mensagem não custa leitura de credencial', async () => {
    /*
     * A recusa barata vem ANTES de abrir o tenant: `openTenant` lê e decifra uma
     * credencial por clínica, e o eco é boa parte do tráfego do webhook.
     */
    await POST(
      request(upsert({ key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: true } })),
    )

    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('mensagem de grupo é ignorada', async () => {
    const response = await POST(
      request(upsert({ key: { remoteJid: '120363000000000000@g.us', fromMe: false } })),
    )

    expect(await response.json()).toEqual({ ignored: 'unsupported-message' })
  })

  it('mensagem sem texto (mídia pura) é ignorada', async () => {
    const response = await POST(request(upsert({ message: { conversation: '   ' } })))

    expect(await response.json()).toEqual({ ignored: 'unsupported-message' })
  })

  it('evento sem instância não vira conversa', async () => {
    const response = await POST(request({ ...upsert(), instance: undefined }))

    expect(await response.json()).toEqual({ ignored: 'unsupported-message' })
  })

  it('instância desconhecida não vira conversa', async () => {
    createSupabaseAdminClient.mockReturnValue(createFakeAdmin({ credentials: [] }).client)

    const response = await POST(request(upsert()))

    expect(await response.json()).toEqual({ ignored: 'unknown-instance' })
    expect(handleIncomingWhatsapp).not.toHaveBeenCalled()
  })
})

describe('cliente administrativo indisponível', () => {
  it('chave ausente vira 503, e não exceção — 500 duplicaria a mensagem', async () => {
    /*
     * `createSupabaseAdminClient()` LANÇA quando falta a chave; nunca devolve
     * nulo. O guarda `if (!admin)` era código morto, e o deploy mal configurado
     * respondia 500 — que é justamente o que faz o provedor reenviar.
     */
    createSupabaseAdminClient.mockImplementation(() => {
      throw new Error('Cliente administrativo indisponivel')
    })

    const response = await POST(request(upsert()))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ ignored: 'unavailable' })
  })

  it('vale também para o recibo', async () => {
    createSupabaseAdminClient.mockImplementation(() => {
      throw new Error('Cliente administrativo indisponivel')
    })

    const response = await POST(request(receipt()))

    expect(response.status).toBe(503)
  })
})

describe('mensagem recebida', () => {
  it('entrega ao domínio a clínica resolvida pela instância, e não pelo payload', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createFakeAdmin({ credentials: knownInstance }).client,
    )

    await POST(request({ ...upsert(), clinicId: OTHER_CLINIC }))

    expect(handleIncomingWhatsapp).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        clinicId: CLINIC,
        instanceName: INSTANCE,
        fromPhone: '5511999998888',
        contactName: 'Marina Costa',
        text: 'Bom dia, queria remarcar',
        providerMessageId: 'PROVIDER-1',
      }),
    )
  })

  it('credencial ilegível não derruba as outras clínicas', async () => {
    createSupabaseAdminClient.mockReturnValue(
      createFakeAdmin({
        credentials: [
          { clinic_id: OTHER_CLINIC, encrypted_payload: 'corrompido' },
          { clinic_id: CLINIC, encrypted_payload: 'cifrado' },
        ],
      }).client,
    )
    decryptIntegrationCredentials
      .mockRejectedValueOnce(new Error('chave do cofre trocada'))
      .mockResolvedValueOnce({ instanceName: INSTANCE })

    await POST(request(upsert()))

    expect(handleIncomingWhatsapp).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ clinicId: CLINIC }),
    )
  })
})

describe('recibo de entrega', () => {
  it('recorta as DUAS consultas pela clínica da instância', async () => {
    /*
     * O defeito que isto trava: o service role ignora RLS, e o id do provedor é
     * único por instância — não globalmente. Sem `clinic_id`, o recibo de uma
     * clínica carimbava a mensagem de outra.
     */
    const fake = createFakeAdmin({
      credentials: knownInstance,
      message: { id: MESSAGE, status: 'sent' },
    })
    createSupabaseAdminClient.mockReturnValue(fake.client)

    const response = await POST(request(receipt()))

    expect(await response.json()).toEqual({ outcome: 'receipt-delivered' })

    const chamadas = fake.ofTable('messages')

    expect(chamadas.filter((call) => call.method === 'eq')).toEqual(
      expect.arrayContaining([
        { table: 'messages', method: 'eq', args: ['clinic_id', CLINIC] },
        {
          table: 'messages',
          method: 'eq',
          args: ['provider_message_id', 'PROVIDER-1'],
        },
        { table: 'messages', method: 'eq', args: ['id', MESSAGE] },
      ]),
    )

    // Duas vezes: uma na leitura, outra na escrita.
    expect(
      chamadas.filter(
        (call) => call.method === 'eq' && call.args[0] === 'clinic_id',
      ),
    ).toHaveLength(2)
  })

  it('instância desconhecida não carimba nada', async () => {
    const fake = createFakeAdmin({
      credentials: [],
      message: { id: MESSAGE, status: 'sent' },
    })
    createSupabaseAdminClient.mockReturnValue(fake.client)

    const response = await POST(request(receipt()))

    expect(await response.json()).toEqual({ ignored: 'unknown-instance' })
    expect(fake.ofTable('messages')).toEqual([])
  })

  it('recibo atrasado não faz a mensagem lida voltar para entregue', async () => {
    const fake = createFakeAdmin({
      credentials: knownInstance,
      message: { id: MESSAGE, status: 'read' },
    })
    createSupabaseAdminClient.mockReturnValue(fake.client)

    const response = await POST(request(receipt()))

    expect(await response.json()).toEqual({ outcome: 'receipt-stale' })
    expect(fake.ofTable('messages').some((call) => call.method === 'update')).toBe(
      false,
    )
  })

  it('status que não acrescenta nada é ignorado antes de abrir o banco', async () => {
    const fake = createFakeAdmin({ credentials: knownInstance })
    createSupabaseAdminClient.mockReturnValue(fake.client)

    const response = await POST(request(receipt({ status: 'SERVER_ACK' })))

    expect(await response.json()).toEqual({ outcome: 'receipt-ignored' })
    expect(fake.ofTable('messages')).toEqual([])
  })

  it('recibo de mensagem que não é nossa não é erro', async () => {
    const fake = createFakeAdmin({ credentials: knownInstance, message: null })
    createSupabaseAdminClient.mockReturnValue(fake.client)

    const response = await POST(request(receipt()))

    expect(await response.json()).toEqual({ outcome: 'receipt-unknown-message' })
  })

  it('falha de leitura vira `receipt-failed`, e não mensagem desconhecida', async () => {
    /*
     * `maybeSingle` devolve erro quando o filtro casa mais de uma linha. Engolir
     * o erro faria isso parecer "mensagem não é nossa" — e o recibo sumiria em
     * silêncio.
     */
    const fake = createFakeAdmin({
      credentials: knownInstance,
      readError: { code: 'PGRST116' },
    })
    createSupabaseAdminClient.mockReturnValue(fake.client)

    const response = await POST(request(receipt()))

    expect(await response.json()).toEqual({ outcome: 'receipt-failed' })
  })

  it('falha de escrita é registrada, e o provedor recebe 200 mesmo assim', async () => {
    const fake = createFakeAdmin({
      credentials: knownInstance,
      message: { id: MESSAGE, status: 'sent' },
      updateError: { code: '42501' },
    })
    createSupabaseAdminClient.mockReturnValue(fake.client)

    const response = await POST(request(receipt()))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ outcome: 'receipt-failed' })
  })

  it('áudio ouvido conta como lido', async () => {
    const fake = createFakeAdmin({
      credentials: knownInstance,
      message: { id: MESSAGE, status: 'delivered' },
    })
    createSupabaseAdminClient.mockReturnValue(fake.client)

    const response = await POST(request(receipt({ status: 'PLAYED' })))

    expect(await response.json()).toEqual({ outcome: 'receipt-read' })
  })

  it('recibo não vira mensagem para a IA responder', async () => {
    const fake = createFakeAdmin({
      credentials: knownInstance,
      message: { id: MESSAGE, status: 'sent' },
    })
    createSupabaseAdminClient.mockReturnValue(fake.client)

    await POST(request(receipt()))

    expect(handleIncomingWhatsapp).not.toHaveBeenCalled()
  })
})
