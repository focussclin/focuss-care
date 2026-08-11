import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A busca de guia na paleta de comandos.
 *
 * A paleta é um campo aberto no cabeçalho de toda tela autenticada. O que se
 * prova aqui é quem a alcança, de qual clínica, e o que ela **não** devolve.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const AUTHORIZATION = '9019956f-bdd8-4d61-868d-09b02332dad0'

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

const recordAuditEvent = vi.fn(async () => ({
  recorded: false as const,
  reason: 'test',
}))
vi.mock('@/lib/audit/audit-log', () => ({
  recordAuditEvent: () => recordAuditEvent(),
}))

const searchAuthorizations = vi.fn()
vi.mock('../infrastructure/repository', () => ({
  insuranceRepositoryFor: () => ({ searchAuthorizations }),
}))

const { searchAuthorizationsAction } = await import(
  './searchAuthorizations.action'
)
const { AUTHORIZATION_SEARCH_LIMIT, authorizationSearchMessages } = await import(
  '../schemas/authorizationSearch.schema'
)

function hit(overrides: Record<string, unknown> = {}) {
  return {
    id: AUTHORIZATION,
    patientName: 'Marina Costa',
    authorizationNumber: '881234',
    status: 'approved' as const,
    providerName: 'Unimed',
    requestedAt: new Date('2026-08-10T12:00:00.000Z'),
    ...overrides,
  }
}

function session(role: string | null = 'finance') {
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
  searchAuthorizations.mockResolvedValue([hit()])
})

describe('quem alcança a busca de guia', () => {
  it.each(['owner', 'admin', 'finance'])('%s busca', async (role) => {
    sessionState.mockResolvedValue(session(role))

    const result = await searchAuthorizationsAction({ query: '881234' })

    expect(result.ok).toBe(true)
  })

  it.each(['professional', 'receptionist'])('%s NÃO busca', async (role) => {
    /*
     * `insurance.manage` é a mesma porta que `/convenios` exige. A paleta é
     * atalho para aquela tela, e atalho que alcança o que a tela recusa é a
     * definição de porta lateral.
     */
    sessionState.mockResolvedValue(session(role))

    const result = await searchAuthorizationsAction({ query: '881234' })

    expect(result.ok).toBe(false)
    expect(searchAuthorizations).not.toHaveBeenCalled()
  })
})

describe('isolamento e limites', () => {
  it('a clínica sai da sessão, nunca da entrada', async () => {
    await searchAuthorizationsAction({
      query: '881234',
      clinicId: 'outra-clinica',
    })

    expect(searchAuthorizations).toHaveBeenCalledWith(
      CLINIC,
      '881234',
      AUTHORIZATION_SEARCH_LIMIT,
    )
  })

  it('uma letra não consulta o banco', async () => {
    const result = await searchAuthorizationsAction({ query: '8' })

    expect(result.ok).toBe(false)
    expect(searchAuthorizations).not.toHaveBeenCalled()
    if (!result.ok) {
      expect(result.error.message).toBe(
        authorizationSearchMessages.queryTooShort,
      )
    }
  })

  it('termo absurdamente longo é recusado antes da consulta', async () => {
    const result = await searchAuthorizationsAction({ query: 'a'.repeat(200) })

    expect(result.ok).toBe(false)
    expect(searchAuthorizations).not.toHaveBeenCalled()
  })
})

describe('o que atravessa a fronteira', () => {
  it('data em ISO, número e operadora — e nada de clínico', async () => {
    const result = await searchAuthorizationsAction({ query: '881234' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data[0]).toEqual({
        id: AUTHORIZATION,
        patientName: 'Marina Costa',
        authorizationNumber: '881234',
        status: 'approved',
        providerName: 'Unimed',
        requestedAt: '2026-08-10T12:00:00.000Z',
      })
    }
  })

  it('procedimento e motivo de negativa não têm por onde vazar', async () => {
    /*
     * O adapter nem os seleciona. Este teste trava o DTO: se alguém voltar a
     * lê-los, a chave nova precisa passar por aqui — e a pergunta "por que a
     * paleta mostra o procedimento pedido?" aparece na revisão, não em produção.
     */
    searchAuthorizations.mockResolvedValue([
      {
        ...hit(),
        procedures: [{ code: '10101012', description: 'Consulta', quantity: 1 }],
        denialReason: 'Fora de cobertura',
      },
    ])

    const result = await searchAuthorizationsAction({ query: '881234' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      const payload = JSON.stringify(result.data)
      expect(payload).not.toContain('10101012')
      expect(payload).not.toContain('Fora de cobertura')
    }
  })

  it('guia sem número devolve null, e não string vazia', async () => {
    // `null` é "a operadora não respondeu"; `''` seria um número em branco.
    searchAuthorizations.mockResolvedValue([
      hit({ authorizationNumber: null, status: 'requested' }),
    ])

    const result = await searchAuthorizationsAction({ query: 'Marina' })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data[0].authorizationNumber).toBeNull()
  })
})

describe('falha de leitura', () => {
  it('não vaza a mensagem do banco', async () => {
    /*
     * O erro do Postgres pode ecoar o valor consultado, e o valor consultado é o
     * que a pessoa digitou — aqui, quase sempre o nome de um paciente.
     */
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    searchAuthorizations.mockRejectedValue(
      new Error('full_name ilike %Marina Costa%'),
    )

    const result = await searchAuthorizationsAction({ query: 'Marina' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe(authorizationSearchMessages.unavailable)
    }
    expect(JSON.stringify(spy.mock.calls)).not.toContain('Marina')

    spy.mockRestore()
  })
})

describe('a busca não entra na trilha', () => {
  it('digitar na paleta não gera evento de auditoria', async () => {
    /*
     * Um evento por tecla — mesmo com debounce — encheria `audit_log` de ruído
     * sobre uma leitura que não entrega dado clínico. Guia é dado
     * administrativo-financeiro, e a tela que a mostra por inteiro é auditada
     * pelas escritas dela.
     */
    await searchAuthorizationsAction({ query: '881234' })

    expect(recordAuditEvent).not.toHaveBeenCalled()
  })
})
