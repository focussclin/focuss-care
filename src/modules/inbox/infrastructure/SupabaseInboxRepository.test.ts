import { describe, expect, it, vi } from 'vitest'

import { SupabaseInboxRepository } from './SupabaseInboxRepository'

/**
 * Contrato da Inbox.
 *
 * Sem banco e sem rede — o cliente é um duplo. `conversations` e `messages` já
 * existem no banco aplicado, então aqui não há caso de migration pendente: o
 * que se prova é o escopo de tenant, a ordem das mensagens e a distinção entre
 * "a conversa sumiu" e "a policy recusou a escrita".
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const OTHER_CLINIC = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'
const CONVERSATION = '11111111-1111-4111-8111-111111111111'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'

interface RecordedCall {
  table: string
  method: string
  args: unknown[]
}

function conversationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONVERSATION,
    clinic_id: CLINIC,
    channel_id: null,
    patient_id: null,
    contact_phone: '5511999990000',
    contact_name: 'Maria Silva',
    status: 'open',
    assigned_to: null,
    is_ai_handled: false,
    last_message_at: '2026-08-09T10:00:00.000Z',
    unread_count: 2,
    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-09T10:00:00.000Z',
    patient: null,
    assigned: null,
    ...overrides,
  }
}

interface FakeOptions {
  rows?: (table: string) => unknown[]
  /** Resultado de cada `maybeSingle`, na ordem em que forem pedidos. */
  singles?: unknown[]
  error?: { code?: string | null; message?: string | null }
}

function repository(options: FakeOptions = {}) {
  const calls: RecordedCall[] = []
  const singles = [...(options.singles ?? [])]

  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {}

    const chain = (method: string) => (...args: unknown[]) => {
      calls.push({ table, method, args })
      return builder
    }

    for (const method of ['select', 'eq', 'in', 'order', 'limit', 'update']) {
      builder[method] = chain(method)
    }

    builder.maybeSingle = async () => {
      calls.push({ table, method: 'maybeSingle', args: [] })
      return {
        data: options.error ? null : (singles.shift() ?? null),
        error: options.error ?? null,
      }
    }

    builder.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({
        data: options.error ? null : (options.rows?.(table) ?? []),
        error: options.error ?? null,
      }).then(onFulfilled, onRejected)

    return builder
  })

  return {
    calls,
    argsOf: (method: string) => calls.filter((call) => call.method === method).map((call) => call.args),
    subject: new SupabaseInboxRepository({ from } as never),
  }
}

describe('leitura de conversas', () => {
  it('filtra pela clínica recebida', async () => {
    const { subject, argsOf } = repository({ rows: () => [conversationRow()] })

    await subject.listConversations(OTHER_CLINIC)

    expect(argsOf('eq')).toContainEqual(['clinic_id', OTHER_CLINIC])
  })

  it('usa o telefone quando o contato não tem nome', async () => {
    const { subject } = repository({ rows: () => [conversationRow({ contact_name: '   ' })] })

    const [conversation] = await subject.listConversations(CLINIC)

    expect(conversation.contactName).toBe('5511999990000')
  })
})

/**
 * A ordem das mensagens é descendente por causa do teto.
 *
 * A consulta pega as mensagens de até 100 conversas com um teto único de 500
 * linhas. Crescente, o teto guardava as MAIS ANTIGAS da clínica inteira:
 * bastavam algumas conversas longas para consumi-lo, e as conversas recentes —
 * as do topo, as com não lidas — chegavam à tela sem mensagem nenhuma, ao lado
 * de um contador dizendo "3 não lidas".
 */
describe('leitura de mensagens', () => {
  it('pede as mais recentes primeiro', async () => {
    const { subject, argsOf } = repository({ rows: () => [] })

    await subject.listMessages(CLINIC, [CONVERSATION])

    expect(argsOf('order')).toContainEqual(['created_at', { ascending: false }])
  })

  it('sem conversas não vai ao banco', async () => {
    const { subject, calls } = repository()

    const messages = await subject.listMessages(CLINIC, [])

    expect(messages).toEqual([])
    expect(calls).toHaveLength(0)
  })
})

/**
 * O caso que decide se a fatia é honesta.
 *
 * `conversations` já está no banco com RLS ativa, mas a verificação registrada
 * em `docs/03-banco-de-dados.md` cobriu leitura anônima, não escrita
 * autenticada. Sem policy de UPDATE para o papel, o Postgres **não devolve
 * erro**: zero linhas mudam, em silêncio.
 */
describe('escrita', () => {
  it('findStatus le o estado atual escopado na clinica', async () => {
    /*
     * A action usa este valor como ORIGEM de `canChangeStatus`. Se a leitura
     * nao filtrasse por clinica, uma conversa de outro tenant poderia decidir
     * se a troca acontece.
     */
    const { subject, argsOf } = repository({ singles: [{ status: 'pending' }] })

    const status = await subject.findStatus(CLINIC, CONVERSATION)

    expect(status).toBe('pending')
    expect(argsOf('eq')).toContainEqual(['clinic_id', CLINIC])
    expect(argsOf('eq')).toContainEqual(['id', CONVERSATION])
  })

  it('findStatus devolve null quando a conversa nao existe aqui', async () => {
    const { subject } = repository({ singles: [null] })

    await expect(subject.findStatus(CLINIC, CONVERSATION)).resolves.toBeNull()
  })

  it('grava o status e devolve a linha que ficou no banco', async () => {
    const { subject, argsOf } = repository({ singles: [conversationRow({ status: 'resolved' })] })

    const conversation = await subject.setStatus(CLINIC, CONVERSATION, 'open', 'resolved')

    expect(conversation.status).toBe('resolved')
    expect(argsOf('update')[0][0]).toMatchObject({ status: 'resolved' })
    expect(argsOf('eq')).toContainEqual(['clinic_id', CLINIC])
    expect(argsOf('eq')).toContainEqual(['id', CONVERSATION])
  })

  it('o responsável nulo devolve a conversa para a fila', async () => {
    const { subject, argsOf } = repository({ singles: [conversationRow()] })

    await subject.setAssignee(CLINIC, CONVERSATION, null)

    expect(argsOf('update')[0][0]).toMatchObject({ assigned_to: null })
  })

  it('marcar leitura zera o contador, e não o decrementa', async () => {
    const { subject, argsOf } = repository({ singles: [conversationRow({ unread_count: 0 })] })

    await subject.markRead(CLINIC, CONVERSATION)

    expect(argsOf('update')[0][0]).toMatchObject({ unread_count: 0 })
  })

  it('o UPDATE não alcança valor, telefone nem paciente', async () => {
    // Esses vêm do provedor. A equipe controla status, responsável e leitura.
    const { subject, argsOf } = repository({ singles: [conversationRow()] })

    await subject.setStatus(CLINIC, CONVERSATION, 'open', 'pending')

    expect(Object.keys(argsOf('update')[0][0] as object).sort()).toEqual(['status', 'updated_at'])
  })

  it('zero linhas com a conversa AINDA legível é recusa de escrita', async () => {
    /*
     * O `maybeSingle` do UPDATE volta nulo e o da releitura acha a linha: a
     * conversa está ali, quem recusou foi a policy de escrita. Chamar isso de
     * "não encontrado" mandaria a pessoa procurar uma conversa que está visível
     * na lista, escondendo que a causa é permissão.
     */
    const { subject } = repository({ singles: [null, { status: 'open' }] })

    await expect(subject.setStatus(CLINIC, CONVERSATION, 'open', 'resolved')).rejects.toMatchObject({
      reason: 'write-forbidden',
    })
  })

  it('zero linhas com a conversa ausente é not-found de verdade', async () => {
    const { subject } = repository({ singles: [null, null] })

    await expect(subject.setStatus(CLINIC, CONVERSATION, 'open', 'resolved')).rejects.toMatchObject({
      reason: 'not-found',
    })
  })

  it('o UPDATE carrega a condição de estado — é o CAS inteiro', async () => {
    /*
     * `.eq('status', from)` é o que impede sobrescrever quem chegou primeiro.
     * Sem ele, duas pessoas resolvendo a mesma conversa em telas diferentes
     * gravariam as duas, e o banco guardaria só a última — as duas telas
     * mostrando sucesso.
     */
    const { subject, argsOf } = repository({ singles: [conversationRow({ status: 'resolved' })] })

    await subject.setStatus(CLINIC, CONVERSATION, 'open', 'resolved')

    expect(argsOf('eq')).toContainEqual(['status', 'open'])
    expect(argsOf('update')[0][0]).toMatchObject({ status: 'resolved' })
  })

  it('mudança concorrente vira STALE, e não not-found', async () => {
    /*
     * O UPDATE não achou linha porque o status já é outro. A conversa está
     * ali, a permissão está certa: alguém chegou primeiro. Reportar
     * "não encontrado" mandaria procurar uma conversa que está na tela.
     */
    const { subject } = repository({ singles: [null, { status: 'resolved' }] })

    await expect(
      subject.setStatus(CLINIC, CONVERSATION, 'open', 'archived'),
    ).rejects.toMatchObject({ reason: 'stale' })
  })

  it('o erro de conflito diz de onde para onde a conversa foi', async () => {
    // Detalhe para o log, não para a tela: quem investiga precisa saber qual
    // transição perdeu a corrida.
    const { subject } = repository({ singles: [null, { status: 'resolved' }] })

    await expect(
      subject.setStatus(CLINIC, CONVERSATION, 'open', 'archived'),
    ).rejects.toThrow(/open.*resolved/)
  })

  it('status ausente na releitura continua sendo not-found', async () => {
    const { subject } = repository({ singles: [null, null] })

    await expect(
      subject.setStatus(CLINIC, CONVERSATION, 'open', 'resolved'),
    ).rejects.toMatchObject({ reason: 'not-found' })
  })

  it('a releitura é escopada na clínica, e não busca só por id', async () => {
    // Sem `clinic_id` na releitura, uma conversa de outro tenant faria a
    // aplicação reportar "sem permissão" em vez de "não existe aqui".
    const { subject, calls } = repository({ singles: [null, null] })

    await subject
      .setStatus(CLINIC, CONVERSATION, 'open', 'resolved')
      .catch(() => undefined)

    const releitura = calls.filter((call) => call.method === 'eq').slice(-2)
    expect(releitura).toContainEqual({ table: 'conversations', method: 'eq', args: ['clinic_id', CLINIC] })
  })
})

describe('tradução das recusas do banco', () => {
  async function reasonOf(error: { code?: string | null; message?: string | null }) {
    const { subject } = repository({ error })
    return subject
      .listConversations(CLINIC)
      .then(() => 'sem erro')
      .catch((cause: { reason: string }) => cause.reason)
  }

  it('recusa da policy de leitura é forbidden', async () => {
    expect(await reasonOf({ code: '42501' })).toBe('forbidden')
    expect(await reasonOf({ code: 'PGRST301' })).toBe('forbidden')
  })

  it('queda de rede é retentável', async () => {
    expect(await reasonOf({ message: 'fetch failed' })).toBe('unavailable')
  })

  it('o resto é inesperado, e leva o código para o log', async () => {
    const { subject } = repository({ error: { code: '23502' } })

    await expect(subject.listConversations(CLINIC)).rejects.toMatchObject({
      reason: 'unexpected',
      code: '23502',
    })
  })
})

describe('escopo de tenant nas escritas', () => {
  it('nunca escreve sem a clínica no filtro', async () => {
    const { subject, argsOf } = repository({ singles: [conversationRow()] })

    await subject.setAssignee(OTHER_CLINIC, CONVERSATION, USER)

    expect(argsOf('eq')).toContainEqual(['clinic_id', OTHER_CLINIC])
  })
})
