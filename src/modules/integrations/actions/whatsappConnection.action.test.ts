import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Conectar o WhatsApp da clínica — sem banco, sem rede, sem Next em runtime.
 *
 * Duas propriedades importam aqui, e nenhuma é sobre o QR aparecer na tela:
 *
 *  1. **O código nunca é auditado.** `audit_log` é append-only e legível por
 *     `audit.read`; um QR ali é uma credencial de pareamento guardada em texto.
 *  2. **A instância nunca vem do cliente.** Ela sai do cofre da clínica ativa —
 *     aceitá-la do formulário deixaria alguém parear o WhatsApp de outra.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const QR = 'data:image/png;base64,iVBORw0KGgoSEGREDO='

vi.mock('next/cache', () => ({ updateTag: () => {}, revalidatePath: () => {} }))
vi.mock('next/server', () => ({
  after: (callback: () => unknown) => {
    void callback()
  },
}))
vi.mock('next/navigation', () => ({ unstable_rethrow: () => {} }))

const sessionState = vi.fn()
vi.mock('@/lib/auth/session', () => ({ getSessionState: () => sessionState() }))

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

const connect = vi.fn()
const status = vi.fn()
const disconnect = vi.fn()
const whatsappInstanceName = vi.fn()

vi.mock('../infrastructure/whatsapp-gateway', () => ({
  whatsappGatewayFor: async () => ({ connect, status, disconnect }),
  whatsappInstanceName: (...args: unknown[]) => whatsappInstanceName(...args),
}))

const saveConnectedChannel = vi.fn()
vi.mock('../infrastructure/whatsapp-channel', () => ({
  saveConnectedChannel: (...args: unknown[]) => saveConnectedChannel(...args),
}))

const {
  connectWhatsappAction,
  whatsappStatusAction,
  disconnectWhatsappAction,
} = await import('./whatsappConnection.action')
const { whatsappConnectionMessages } = await import(
  '../schemas/whatsappConnection.schema'
)

function session(role: string | null = 'owner') {
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
  sessionState.mockResolvedValue(session())
  whatsappInstanceName.mockResolvedValue('focuss-clinica')
  connect.mockResolvedValue({
    instanceName: 'focuss-clinica',
    state: 'awaiting_scan',
    qrCode: QR,
    phoneNumber: null,
  })
  status.mockResolvedValue({
    instanceName: 'focuss-clinica',
    state: 'connected',
    qrCode: null,
    phoneNumber: '5511988887777',
  })
  disconnect.mockResolvedValue(undefined)
})

describe('quem pode conectar o canal', () => {
  it.each(['owner', 'admin'])('%s conecta', async (role) => {
    sessionState.mockResolvedValue(session(role))

    const result = await connectWhatsappAction()

    expect(result.ok).toBe(true)
  })

  it.each(['professional', 'receptionist', 'finance'])(
    '%s NÃO conecta',
    async (role) => {
      // O número pareado passa a responder por toda a clínica: é configuração,
      // não operação de atendimento.
      sessionState.mockResolvedValue(session(role))

      const result = await connectWhatsappAction()

      expect(result.ok).toBe(false)
      expect(connect).not.toHaveBeenCalled()
    },
  )
})

describe('o QR não entra na trilha de auditoria', () => {
  it('o evento registra o estado, nunca o código', async () => {
    await connectWhatsappAction()

    const event = recordAuditEvent.mock.calls[0][0] as {
      action: string
      after: Record<string, unknown>
    }

    expect(event.action).toBe('whatsapp.connect')
    expect(event.after).toEqual({ state: 'awaiting_scan', qr_presente: true })

    // A prova que interessa: o código não está em lugar nenhum do evento.
    expect(JSON.stringify(event)).not.toContain('iVBORw0KGgoSEGREDO')
  })

  it('consultar o estado não gera evento nenhum', async () => {
    /*
     * A tela pergunta a cada poucos segundos enquanto o QR está visível.
     * Auditar cada volta esconderia o evento que importa sob o ruído.
     */
    await whatsappStatusAction()

    expect(recordAuditEvent).not.toHaveBeenCalled()
  })
})

describe('a instância vem do cofre, não do cliente', () => {
  it('a action não aceita nome de instância', async () => {
    // A assinatura não tem parâmetro: não há por onde passar outra clínica.
    expect(connectWhatsappAction.length).toBe(0)

    await connectWhatsappAction()

    expect(connect).toHaveBeenCalledWith('focuss-clinica')
  })

  it('sem credencial cadastrada, explica o que fazer', async () => {
    whatsappInstanceName.mockResolvedValue(null)

    const result = await connectWhatsappAction()

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe(whatsappConnectionMessages.notConfigured)
    }
    expect(connect).not.toHaveBeenCalled()
  })
})

describe('estado do canal no banco', () => {
  it('conexão bem-sucedida é refletida', async () => {
    await whatsappStatusAction()

    expect(saveConnectedChannel).toHaveBeenCalledWith(
      supabase,
      CLINIC,
      expect.objectContaining({ state: 'connected', phoneNumber: '5511988887777' }),
    )
  })

  it('desconectar marca o canal como inativo', async () => {
    const result = await disconnectWhatsappAction()

    expect(disconnect).toHaveBeenCalledWith('focuss-clinica')
    expect(saveConnectedChannel).toHaveBeenCalledWith(
      supabase,
      CLINIC,
      expect.objectContaining({ state: 'disconnected' }),
    )
    expect(result.ok).toBe(true)
  })
})

describe('falha do provedor', () => {
  it('chave recusada não vira "tente novamente"', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { WhatsappGatewayError } = await import('../domain/WhatsappConnection')
    connect.mockRejectedValue(
      new WhatsappGatewayError('unauthorized', 'provedor recusou'),
    )

    const result = await connectWhatsappAction()

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe(whatsappConnectionMessages.unauthorized)
    }

    spy.mockRestore()
  })
})
