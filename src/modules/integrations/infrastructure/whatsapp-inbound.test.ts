import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O que acontece quando um paciente escreve no WhatsApp da clínica.
 *
 * Este é o módulo em que uma máquina fala com paciente em nome de uma clínica, e
 * ele não tinha teste. O que aqui está travado é a **ordem dos freios** — a
 * garantia de que cada um deles vem antes do modelo, e não depois:
 *
 *  1. A mensagem do paciente é registrada ANTES de qualquer IA. Se tudo abaixo
 *     falhar, alguém vê a mensagem no inbox.
 *  2. Assunto clínico e urgência **não chegam ao modelo**. É regra local, não
 *     pedido no prompt: não depende de o modelo obedecer.
 *  3. `clinic_settings.ai_enabled` desligado cala a IA da clínica inteira.
 *  4. Conversa que a recepção assumiu não volta para a máquina.
 *  5. Número sem paciente vinculado vai para humano.
 *  6. Qualquer falha vira escalonamento — nunca silêncio.
 */

const answer = vi.fn()
const sendText = vi.fn()
const aiAssistantGatewayFor = vi.fn()
const whatsappGatewayFor = vi.fn()

vi.mock('./ai-assistant-gateway', () => ({
  aiAssistantGatewayFor: (...args: unknown[]) => aiAssistantGatewayFor(...args),
}))

vi.mock('./whatsapp-gateway', () => ({
  whatsappGatewayFor: (...args: unknown[]) => whatsappGatewayFor(...args),
}))

const { handleIncomingWhatsapp } = await import('./whatsapp-inbound')
const { AiGatewayError } = await import('../domain/AiAssistant')

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const CONVERSATION = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const PATIENT = '11111111-1111-4111-8111-111111111111'
const PHONE = '5511999998888'

interface RecordedCall {
  table: string
  method: string
  args: unknown[]
}

/**
 * O duplo do Supabase.
 *
 * Grava a cadeia de chamadas em vez de falar com o banco. É o que permite
 * afirmar "o modelo NÃO foi chamado" e "a nota interna foi gravada" sem rede.
 */
function createFakeClient(options: {
  conversation?: {
    id: string
    patient_id: string | null
    contact_name: string | null
    is_ai_handled: boolean
    unread_count: number
  } | null
  patient?: { id: string; full_name: string } | null
  aiEnabled?: boolean
  /** Clínica que nunca salvou configurações: não há linha em `clinic_settings`. */
  settingsMissing?: boolean
  settingsError?: { code: string } | null
  history?: { direction: string; body: string | null }[]
  insertError?: { code: string } | null
} = {}) {
  const calls: RecordedCall[] = []

  const from = vi.fn((table: string) => {
    const query: Record<string, unknown> = {}
    let selected = ''

    for (const method of ['select', 'eq', 'or', 'is', 'in', 'order', 'limit', 'update', 'insert']) {
      query[method] = (...args: unknown[]) => {
        calls.push({ table, method, args })
        if (method === 'select' && typeof args[0] === 'string') selected = args[0]
        return query
      }
    }

    query.maybeSingle = async () => {
      if (table === 'conversations') {
        return { data: options.conversation ?? null, error: null }
      }
      if (table === 'patients') {
        return { data: options.patient ?? null, error: null }
      }
      if (table === 'clinic_settings') {
        if (options.settingsError) {
          return { data: null, error: options.settingsError }
        }
        if (options.settingsMissing) return { data: null, error: null }
        return {
          data: { ai_enabled: options.aiEnabled ?? true, business_hours: null },
          error: null,
        }
      }
      return { data: null, error: null }
    }

    query.single = async () => {
      if (table === 'conversations') {
        return {
          data: {
            id: CONVERSATION,
            patient_id: options.patient?.id ?? null,
            contact_name: options.patient?.full_name ?? 'Marina Costa',
            is_ai_handled: true,
          },
          error: null,
        }
      }
      if (table === 'clinics') {
        return {
          data: { trade_name: 'Clínica Alfa', phone: null, address: null },
          error: null,
        }
      }
      return { data: null, error: null }
    }

    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      const payload =
        table === 'messages' && selected.includes('direction')
          ? { data: options.history ?? [], error: null }
          : { data: null, error: options.insertError ?? null }

      return Promise.resolve(payload).then(onFulfilled, onRejected)
    }

    return query
  })

  return {
    calls,
    client: { from } as never,
    ofTable: (table: string) => calls.filter((call) => call.table === table),
    /** O que foi gravado em `messages`, por direção. */
    inserted: (direction: string) =>
      calls.filter(
        (call) =>
          call.table === 'messages' &&
          call.method === 'insert' &&
          (call.args[0] as { direction?: string })?.direction === direction,
      ),
  }
}

function incoming(text: string) {
  return {
    clinicId: CLINIC,
    instanceName: 'clinica-alfa',
    fromPhone: PHONE,
    contactName: 'Marina Costa',
    text,
    providerMessageId: 'PROVIDER-1',
  }
}

const openConversation = {
  id: CONVERSATION,
  patient_id: PATIENT,
  contact_name: 'Marina Costa',
  is_ai_handled: true,
  unread_count: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  answer.mockResolvedValue({
    decision: 'answer',
    text: 'Nosso horário é das 8h às 18h.',
    escalationReason: null,
    model: 'gpt-4o-mini',
    inputTokens: 120,
    outputTokens: 40,
  })
  sendText.mockResolvedValue({ providerMessageId: 'PROVIDER-OUT-1' })
  aiAssistantGatewayFor.mockResolvedValue({ answer })
  whatsappGatewayFor.mockResolvedValue({ sendText })
})

// ---------------------------------------------------------------------------

describe('a mensagem do paciente é registrada antes de qualquer IA', () => {
  it('grava a entrada mesmo quando a conversa vai para humano', async () => {
    const fake = createFakeClient({
      conversation: { ...openConversation, patient_id: null },
    })

    await handleIncomingWhatsapp(fake.client, incoming('Bom dia'))

    expect(fake.inserted('inbound')).toHaveLength(1)
    expect(fake.inserted('inbound')[0].args[0]).toMatchObject({
      clinic_id: CLINIC,
      body: 'Bom dia',
      // `delivered`: chegou até a clínica. Ninguém leu ainda.
      status: 'delivered',
      is_from_ai: false,
    })
  })
})

describe('contador de não lidas', () => {
  it('SOMA a cada mensagem, em vez de travar em 1', async () => {
    /*
     * A tela desenha o contador como número, com "9+" acima de nove. Gravar 1
     * fixo fazia sete mensagens seguidas aparecerem como uma só, e tornava o
     * "9+" inalcançável — o WhatsApp é o único canal que grava entrada.
     */
    const fake = createFakeClient({
      conversation: { ...openConversation, unread_count: 6 },
    })

    await handleIncomingWhatsapp(fake.client, incoming('Bom dia'))

    const update = fake
      .ofTable('conversations')
      .find((call) => call.method === 'update')

    expect(update?.args[0]).toMatchObject({ unread_count: 7 })
  })

  it('conversa nunca lida parte de zero', async () => {
    const fake = createFakeClient({
      conversation: { ...openConversation, unread_count: 0 },
    })

    await handleIncomingWhatsapp(fake.client, incoming('Bom dia'))

    const update = fake
      .ofTable('conversations')
      .find((call) => call.method === 'update')

    expect(update?.args[0]).toMatchObject({ unread_count: 1 })
  })

  it('recorta a escrita pela clínica, e não só pelo id', async () => {
    // Quem chama é o webhook, com o cliente administrativo: não há RLS atrás.
    const fake = createFakeClient({ conversation: openConversation })

    await handleIncomingWhatsapp(fake.client, incoming('Bom dia'))

    expect(fake.ofTable('conversations')).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
    )
  })
})

describe('freio local: o que nunca chega ao modelo', () => {
  it('urgência vai para humano sem gastar token', async () => {
    const fake = createFakeClient({ conversation: openConversation })

    const outcome = await handleIncomingWhatsapp(
      fake.client,
      incoming('socorro, estou passando mal'),
    )

    expect(outcome).toBe('escalated')
    expect(aiAssistantGatewayFor).not.toHaveBeenCalled()
    expect(answer).not.toHaveBeenCalled()
    expect(sendText).not.toHaveBeenCalled()
  })

  it('assunto clínico vai para humano sem gastar token', async () => {
    const fake = createFakeClient({ conversation: openConversation })

    const outcome = await handleIncomingWhatsapp(
      fake.client,
      incoming('posso tomar dipirona junto com o outro remédio?'),
    )

    expect(outcome).toBe('escalated')
    expect(answer).not.toHaveBeenCalled()
  })

  it('o motivo vira nota interna, e não mensagem para o paciente', async () => {
    /*
     * A recepção precisa saber POR QUE a conversa chegou na fila humana:
     * "possível urgência" e "dúvida de horário" chegam na mesma lista, e é a
     * nota que decide qual abrir primeiro. Ela não pode viajar para o WhatsApp.
     */
    const fake = createFakeClient({ conversation: openConversation })

    await handleIncomingWhatsapp(fake.client, incoming('urgente!'))

    expect(fake.inserted('internal')[0].args[0]).toMatchObject({
      body: 'Possível urgência — mensagem encaminhada para atendimento humano.',
      is_from_ai: true,
    })
    expect(sendText).not.toHaveBeenCalled()
  })

  it('escalar tira a conversa da IA de forma definitiva', async () => {
    const fake = createFakeClient({ conversation: openConversation })

    await handleIncomingWhatsapp(fake.client, incoming('urgente!'))

    const update = fake
      .ofTable('conversations')
      .find(
        (call) =>
          call.method === 'update' &&
          (call.args[0] as { is_ai_handled?: boolean })?.is_ai_handled === false,
      )

    expect(update?.args[0]).toMatchObject({
      is_ai_handled: false,
      status: 'pending',
    })
  })
})

describe('o interruptor da clínica', () => {
  it('IA desligada nas configurações cala a máquina', async () => {
    const fake = createFakeClient({
      conversation: openConversation,
      aiEnabled: false,
    })

    const outcome = await handleIncomingWhatsapp(fake.client, incoming('Bom dia'))

    expect(outcome).toBe('ignored-ai-disabled')
    expect(answer).not.toHaveBeenCalled()
    expect(fake.inserted('internal')[0].args[0]).toMatchObject({
      body: 'IA desligada nas configurações da clínica.',
    })
  })

  it('falha ao ler a configuração conta como DESLIGADO', async () => {
    /*
     * Erra para o lado barato: uma resposta automática a menos custa o tempo de
     * alguém responder à mão; uma a mais é a máquina falando sem autorização.
     */
    const fake = createFakeClient({
      conversation: openConversation,
      settingsError: { code: '42501' },
    })

    const outcome = await handleIncomingWhatsapp(fake.client, incoming('Bom dia'))

    expect(outcome).toBe('ignored-ai-disabled')
    expect(answer).not.toHaveBeenCalled()
  })

  it('clínica que nunca salvou configurações não autorizou nada', async () => {
    /*
     * Ausência de linha em `clinic_settings` conta como DESLIGADO, e não como
     * "ainda não decidiu": quem nunca abriu a tela não pediu para uma máquina
     * falar com seus pacientes.
     */
    const fake = createFakeClient({
      conversation: openConversation,
      settingsMissing: true,
    })

    const outcome = await handleIncomingWhatsapp(fake.client, incoming('Bom dia'))

    expect(outcome).toBe('ignored-ai-disabled')
    expect(answer).not.toHaveBeenCalled()
  })

  it('a conversa que a recepção assumiu não volta para a máquina', async () => {
    const fake = createFakeClient({
      conversation: { ...openConversation, is_ai_handled: false },
    })

    const outcome = await handleIncomingWhatsapp(fake.client, incoming('Bom dia'))

    expect(outcome).toBe('ignored-ai-off')
    expect(answer).not.toHaveBeenCalled()
  })

  it('número sem paciente vinculado vai para humano', async () => {
    const fake = createFakeClient({
      conversation: { ...openConversation, patient_id: null },
    })

    const outcome = await handleIncomingWhatsapp(fake.client, incoming('Bom dia'))

    expect(outcome).toBe('ignored-unknown-contact')
    expect(answer).not.toHaveBeenCalled()
    expect(fake.inserted('internal')[0].args[0]).toMatchObject({
      body: 'Contato sem cadastro de paciente — atendimento humano.',
    })
  })
})

describe('resposta gerada', () => {
  it('envia ao paciente e registra a saída marcada como IA', async () => {
    const fake = createFakeClient({ conversation: openConversation })

    const outcome = await handleIncomingWhatsapp(fake.client, incoming('Que horas abre?'))

    expect(outcome).toBe('replied')
    expect(sendText).toHaveBeenCalledWith(
      'clinica-alfa',
      PHONE,
      'Nosso horário é das 8h às 18h.',
    )
    expect(fake.inserted('outbound')[0].args[0]).toMatchObject({
      body: 'Nosso horário é das 8h às 18h.',
      provider_message_id: 'PROVIDER-OUT-1',
      // A marca que permite auditar depois o que a máquina disse.
      is_from_ai: true,
    })
  })

  it('a mensagem atual entra no histórico enviado ao modelo', async () => {
    const fake = createFakeClient({
      conversation: openConversation,
      history: [
        { direction: 'inbound', body: 'Oi' },
        { direction: 'outbound', body: 'Olá! Como posso ajudar?' },
      ],
    })

    await handleIncomingWhatsapp(fake.client, incoming('Que horas abre?'))

    expect(answer).toHaveBeenCalledWith(
      expect.objectContaining({
        history: [
          { role: 'assistant', text: 'Olá! Como posso ajudar?' },
          { role: 'user', text: 'Oi' },
          { role: 'user', text: 'Que horas abre?' },
        ],
      }),
    )
  })

  it('registra o consumo de tokens por clínica', async () => {
    const fake = createFakeClient({ conversation: openConversation })

    await handleIncomingWhatsapp(fake.client, incoming('Que horas abre?'))

    expect(fake.ofTable('ai_usage_log')[0].args[0]).toMatchObject({
      clinic_id: CLINIC,
      feature: 'patient_chat',
      model: 'gpt-4o-mini',
      input_tokens: 120,
      output_tokens: 40,
      was_error: false,
    })
  })

  it('o modelo pedindo escalonamento não envia nada ao paciente', async () => {
    answer.mockResolvedValue({
      decision: 'escalate',
      text: null,
      escalationReason: 'Pergunta fora do que sei responder.',
      model: 'gpt-4o-mini',
      inputTokens: 90,
      outputTokens: 10,
    })
    const fake = createFakeClient({ conversation: openConversation })

    const outcome = await handleIncomingWhatsapp(fake.client, incoming('Quanto custa?'))

    expect(outcome).toBe('escalated')
    expect(sendText).not.toHaveBeenCalled()
    expect(fake.inserted('internal')[0].args[0]).toMatchObject({
      body: 'Pergunta fora do que sei responder.',
    })
  })

  it('o consumo é registrado mesmo quando a decisão foi escalar', async () => {
    // O token foi gasto de qualquer jeito — a clínica precisa ver o custo.
    answer.mockResolvedValue({
      decision: 'escalate',
      text: null,
      escalationReason: 'Não sei responder.',
      model: 'gpt-4o-mini',
      inputTokens: 90,
      outputTokens: 10,
    })
    const fake = createFakeClient({ conversation: openConversation })

    await handleIncomingWhatsapp(fake.client, incoming('Quanto custa?'))

    expect(fake.ofTable('ai_usage_log')).not.toEqual([])
  })
})

describe('falha nunca vira silêncio', () => {
  it('modelo indisponível escalona em vez de deixar o paciente sem resposta', async () => {
    answer.mockRejectedValue(new AiGatewayError('unavailable', 'timeout'))
    const fake = createFakeClient({ conversation: openConversation })

    const outcome = await handleIncomingWhatsapp(fake.client, incoming('Que horas abre?'))

    expect(outcome).toBe('failed')
    expect(fake.inserted('internal')[0].args[0]).toMatchObject({
      body: 'Falha técnica ao gerar resposta — atendimento humano.',
    })
  })

  it('falha no envio também escalona — a resposta não chegou', async () => {
    sendText.mockRejectedValue(new Error('Evolution fora do ar'))
    const fake = createFakeClient({ conversation: openConversation })

    const outcome = await handleIncomingWhatsapp(fake.client, incoming('Que horas abre?'))

    expect(outcome).toBe('failed')
  })

  it('credencial da OpenAI ausente escalona, e não explode', async () => {
    aiAssistantGatewayFor.mockRejectedValue(
      new AiGatewayError('not-configured', 'sem chave'),
    )
    const fake = createFakeClient({ conversation: openConversation })

    const outcome = await handleIncomingWhatsapp(fake.client, incoming('Que horas abre?'))

    expect(outcome).toBe('failed')
    expect(sendText).not.toHaveBeenCalled()
  })
})

describe('conversa nova', () => {
  it('nasce vinculada ao paciente quando o telefone bate', async () => {
    const fake = createFakeClient({
      conversation: null,
      patient: { id: PATIENT, full_name: 'Marina Costa' },
    })

    await handleIncomingWhatsapp(fake.client, incoming('Que horas abre?'))

    const insert = fake
      .ofTable('conversations')
      .find((call) => call.method === 'insert')

    expect(insert?.args[0]).toMatchObject({
      clinic_id: CLINIC,
      contact_phone: PHONE,
      patient_id: PATIENT,
      contact_name: 'Marina Costa',
      status: 'open',
      is_ai_handled: true,
      unread_count: 1,
    })
  })

  it('telefone desconhecido abre conversa sem paciente e vai para humano', async () => {
    const fake = createFakeClient({ conversation: null, patient: null })

    const outcome = await handleIncomingWhatsapp(fake.client, incoming('Que horas abre?'))

    expect(outcome).toBe('ignored-unknown-contact')
    expect(answer).not.toHaveBeenCalled()
  })

  it('procura o paciente só entre os não apagados desta clínica', async () => {
    const fake = createFakeClient({
      conversation: null,
      patient: { id: PATIENT, full_name: 'Marina Costa' },
    })

    await handleIncomingWhatsapp(fake.client, incoming('Que horas abre?'))

    const chamadas = fake.ofTable('patients')

    expect(chamadas).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
    )
    expect(chamadas).toContainEqual(
      expect.objectContaining({ method: 'is', args: ['deleted_at', null] }),
    )
  })
})
