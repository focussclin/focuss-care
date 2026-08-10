import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A troca de status pelo pipeline real.
 *
 * **Não há banco, nem rede, nem Next em runtime.** O que se verifica é o que o
 * servidor decide sozinho — e a decisão que dá nome a este arquivo: a regra
 * `canChangeStatus` vale na ACTION, e não só no clique.
 *
 * Ela existia apenas na tela. Quem chamasse a action direto, ou tivesse uma aba
 * aberta com a lista defasada, passava por fora: o UPDATE gravava o mesmo
 * status, mexia `updated_at` e a conversa pulava para o topo da lista sem que
 * nada tivesse acontecido. Repetido, é uma inbox que se reordena sozinha.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const CONVERSATION = '11111111-1111-4111-8111-111111111111'

const updateTag = vi.fn<(tag: string) => void>()
const revalidatePath = vi.fn<(path: string) => void>()

vi.mock('next/cache', () => ({
  updateTag: (tag: string) => updateTag(tag),
  revalidatePath: (path: string) => revalidatePath(path),
}))

vi.mock('next/server', () => ({
  after: (callback: () => unknown) => {
    void callback()
  },
}))

vi.mock('next/navigation', () => ({ unstable_rethrow: () => {} }))

const sessionState = vi.fn()
vi.mock('@/lib/auth/session', () => ({
  getSessionState: () => sessionState(),
}))

const supabase = { __fake: true }
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => supabase,
}))

const recordAuditEvent = vi.fn(
  async (event: unknown): Promise<{ recorded: false; reason: string }> => {
    void event
    return { recorded: false, reason: 'test' }
  },
)
vi.mock('@/lib/audit/audit-log', () => ({
  recordAuditEvent: (event: unknown) => recordAuditEvent(event),
}))

const findStatus = vi.fn()
const setStatus = vi.fn()
vi.mock('../infrastructure/repository', () => ({
  inboxRepositoryFor: () => ({ findStatus, setStatus }),
}))

const { setConversationStatusAction } = await import('./setConversationStatus.action')
const { inboxMessages } = await import('../schemas/inbox.schema')
const { InboxRepositoryError } = await import('../domain/InboxRepositoryError')

function conversation(status: string) {
  return {
    id: CONVERSATION,
    contactName: 'Maria Silva',
    contactPhone: '5511999990000',
    status,
    assignedTo: null,
    isAiHandled: false,
    lastMessageAt: null,
    unreadCount: 0,
    patientId: null,
    patientName: null,
    messages: [],
  }
}

function activeSession(role: string | null = 'receptionist') {
  return {
    status: 'active' as const,
    user: { id: USER, email: null, displayName: 'Teste', avatarUrl: null },
    clinicId: CLINIC,
    clinicName: null,
    role,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.mockResolvedValue(activeSession())
  findStatus.mockResolvedValue('open')
  setStatus.mockResolvedValue(conversation('resolved'))
})

describe('a regra de domínio vale no servidor', () => {
  it('status igual ao atual NÃO grava, e volta como validação', async () => {
    /*
     * O buraco que esta fatia fechou. A tela já não oferecia a troca, mas a
     * action aceitava — e ninguém garante que quem chama a action passou pela
     * tela.
     */
    const result = await setConversationStatusAction({
      conversationId: CONVERSATION,
      status: 'open',
    })

    expect(result.ok).toBe(false)
    expect(setStatus).not.toHaveBeenCalled()
    if (!result.ok) {
      expect(result.error.code).toBe('validation')
      expect(result.error.message).toBe(inboxMessages.statusUnchanged)
    }
  })

  it('status diferente grava normalmente', async () => {
    const result = await setConversationStatusAction({
      conversationId: CONVERSATION,
      status: 'resolved',
    })

    expect(result.ok).toBe(true)
    // O `from` desce junto: vira condicao no WHERE do UPDATE.
    expect(setStatus).toHaveBeenCalledWith(CLINIC, CONVERSATION, 'open', 'resolved')
  })

  it('a origem vem do BANCO, e não do cliente', async () => {
    /*
     * Uma aba aberta há meia hora acha que a conversa está `open`; no banco ela
     * já foi resolvida por outra pessoa. Pedir `resolved` a partir dessa tela
     * defasada tem de ser recusado pelo estado real, não pelo que a aba lembra.
     */
    findStatus.mockResolvedValue('resolved')

    const result = await setConversationStatusAction({
      conversationId: CONVERSATION,
      status: 'resolved',
    })

    expect(result.ok).toBe(false)
    expect(findStatus).toHaveBeenCalledWith(CLINIC, CONVERSATION)
    expect(setStatus).not.toHaveBeenCalled()
  })

  it('conversa inexistente é not-found, e não "status igual"', async () => {
    // `findStatus` nulo significa que a linha não existe nesta clínica —
    // dizer "já está neste status" mandaria corrigir algo que não existe.
    findStatus.mockResolvedValue(null)

    const result = await setConversationStatusAction({
      conversationId: CONVERSATION,
      status: 'resolved',
    })

    expect(result.ok).toBe(false)
    expect(setStatus).not.toHaveBeenCalled()
    if (!result.ok) {
      expect(result.error.code).toBe('not-found')
      expect(result.error.message).toBe(inboxMessages.notFound)
    }
  })

  it('a leitura de origem é escopada na clínica da sessão', async () => {
    // `clinicId` nunca vem do cliente: sai do `ActionContext`.
    await setConversationStatusAction({ conversationId: CONVERSATION, status: 'pending' })

    expect(findStatus).toHaveBeenCalledWith(CLINIC, CONVERSATION)
  })
})

/**
 * A leitura de origem NAO fecha a janela de concorrencia — e nao e para isso
 * que serve. Entre `findStatus` e a gravacao cabe outra pessoa resolvendo a
 * mesma conversa; quem fecha e o `from` que vai para o `WHERE` do UPDATE.
 */
describe('concorrência', () => {
  it('a origem lida é a que desce como condição, e não a que o cliente supõe', async () => {
    findStatus.mockResolvedValue('pending')

    await setConversationStatusAction({ conversationId: CONVERSATION, status: 'resolved' })

    expect(setStatus).toHaveBeenCalledWith(CLINIC, CONVERSATION, 'pending', 'resolved')
  })

  it('conflito do banco vira mensagem de recarregar, e não "não encontrado"', async () => {
    /*
     * O adapter detecta que a conversa saiu de `open` antes da gravação e
     * levanta `stale`. A tradução precisa dizer o que fazer: recarregar. Dizer
     * "não encontrado" mandaria procurar uma conversa que está na tela, e
     * "tente novamente" repetiria a mesma corrida com o mesmo estado velho.
     */
    setStatus.mockRejectedValue(new InboxRepositoryError('stale', 'saiu de open para resolved'))

    const result = await setConversationStatusAction({
      conversationId: CONVERSATION,
      status: 'archived',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('conflict')
      expect(result.error.message).toBe(inboxMessages.stale)
    }
  })

  it('recusa de escrita continua distinta do conflito', async () => {
    // Mesma origem, causas diferentes: aqui a condição batia e o banco recusou.
    setStatus.mockRejectedValue(new InboxRepositoryError('write-forbidden', 'policy'))

    const result = await setConversationStatusAction({
      conversationId: CONVERSATION,
      status: 'resolved',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('forbidden')
      expect(result.error.message).toBe(inboxMessages.writeForbidden)
    }
  })

  it('conversa que sumiu entre a leitura e a escrita é not-found', async () => {
    setStatus.mockRejectedValue(new InboxRepositoryError('not-found', 'sumiu'))

    const result = await setConversationStatusAction({
      conversationId: CONVERSATION,
      status: 'resolved',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not-found')
  })
})

describe('quem pode trocar o status', () => {
  it.each(['owner', 'admin', 'professional', 'receptionist'])('%s troca', async (role) => {
    sessionState.mockResolvedValue(activeSession(role))

    const result = await setConversationStatusAction({
      conversationId: CONVERSATION,
      status: 'resolved',
    })

    expect(result.ok).toBe(true)
  })

  it('finance não atende conversa', async () => {
    // `encounter.write` é atendimento; `finance` alcança cobrança.
    sessionState.mockResolvedValue(activeSession('finance'))

    const result = await setConversationStatusAction({
      conversationId: CONVERSATION,
      status: 'resolved',
    })

    expect(result.ok).toBe(false)
    expect(findStatus).not.toHaveBeenCalled()
    expect(setStatus).not.toHaveBeenCalled()
  })

  it('sessão sem papel não troca', async () => {
    sessionState.mockResolvedValue(activeSession(null))

    const result = await setConversationStatusAction({
      conversationId: CONVERSATION,
      status: 'resolved',
    })

    expect(result.ok).toBe(false)
    expect(setStatus).not.toHaveBeenCalled()
  })
})

describe('entrada inválida', () => {
  it('status fora do enum do banco nem chega ao repositório', async () => {
    const result = await setConversationStatusAction({
      conversationId: CONVERSATION,
      status: 'urgente',
    })

    expect(result.ok).toBe(false)
    expect(findStatus).not.toHaveBeenCalled()
  })

  it('id que não é uuid é recusado antes da leitura', async () => {
    const result = await setConversationStatusAction({
      conversationId: 'conversa-1',
      status: 'resolved',
    })

    expect(result.ok).toBe(false)
    expect(findStatus).not.toHaveBeenCalled()
  })
})
