import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Desligar e reverter — feature **S-03**.
 *
 * Duas actions para uma escrita só. `audit_log` é lido por pergunta — "quem
 * desligou quem, e quando" —, e um evento único com a data dentro faria a
 * reversão parecer um desligamento com data nula.
 *
 * **Não há banco, nem rede, nem Next em runtime.**
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const EMPLOYEE = '5f2b1a3c-4d5e-4f60-8a71-9b2c3d4e5f60'

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

const recordAuditEvent = vi.fn(async (event: unknown) => {
  void event
  return { recorded: false as const, reason: 'test' }
})
vi.mock('@/lib/audit/audit-log', () => ({
  recordAuditEvent: (event: unknown) => recordAuditEvent(event),
}))

const setEmployeeTermination = vi.fn()
vi.mock('../infrastructure/repository', () => ({
  teamRepositoryFor: () => ({ setEmployeeTermination }),
}))

const { terminateEmployeeAction, reinstateEmployeeAction } = await import(
  './staff.action'
)
const { employeeMessages } = await import('../schemas/team.schema')
const { TeamRepositoryError } = await import('../domain/TeamRepositoryError')

function employee(overrides: Record<string, unknown> = {}) {
  return {
    id: EMPLOYEE,
    fullName: 'Ana Ribeiro',
    roleTitle: 'Recepcionista',
    contractType: 'clt' as const,
    isActive: false,
    hireDate: new Date('2026-03-01T00:00:00'),
    terminationDate: new Date('2026-08-10T00:00:00'),
    professionalId: null,
    ...overrides,
  }
}

function session(role: string | null = 'admin') {
  return {
    status: 'active' as const,
    user: { id: USER, email: null, displayName: 'Teste', avatarUrl: null },
    clinicId: CLINIC,
    clinicName: null,
    role,
  }
}

const input = { employeeId: EMPLOYEE, terminationDate: '2026-08-10' }

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.mockResolvedValue(session())
  setEmployeeTermination.mockResolvedValue(employee())
})

describe('quem registra o desligamento', () => {
  it.each(['owner', 'admin'])('%s registra', async (role) => {
    sessionState.mockResolvedValue(session(role))

    const result = await terminateEmployeeAction(input)

    expect(result.ok).toBe(true)
  })

  it.each(['professional', 'receptionist', 'finance'])(
    '%s NÃO registra',
    async (role) => {
      /*
       * `team.manage`: desligar alguém é ato de gestão, não consulta. Quem
       * atende vê a equipe; quem administra encerra o vínculo.
       */
      sessionState.mockResolvedValue(session(role))

      const result = await terminateEmployeeAction(input)

      expect(result.ok).toBe(false)
      expect(setEmployeeTermination).not.toHaveBeenCalled()
    },
  )
})

describe('o que chega ao repositório', () => {
  it('a clínica sai da sessão e a data vira dia de calendário local', async () => {
    await terminateEmployeeAction({ ...input, clinicId: 'outra-clinica' })

    const [clinicId, employeeId, date] = setEmployeeTermination.mock.calls[0]

    expect(clinicId).toBe(CLINIC)
    expect(employeeId).toBe(EMPLOYEE)
    // Meia-noite LOCAL: `new Date('2026-08-10')` seria meia-noite em UTC, e o
    // fuso devolveria o dia 9 no Brasil.
    expect((date as Date).getDate()).toBe(10)
    expect((date as Date).getMonth()).toBe(7)
  })

  it('reverter manda `null`, e não uma data qualquer', async () => {
    setEmployeeTermination.mockResolvedValue(
      employee({ isActive: true, terminationDate: null }),
    )

    const result = await reinstateEmployeeAction({ employeeId: EMPLOYEE })

    expect(result.ok).toBe(true)
    expect(setEmployeeTermination).toHaveBeenCalledWith(CLINIC, EMPLOYEE, null)
  })

  it('data em formato inválido nem chega ao repositório', async () => {
    const result = await terminateEmployeeAction({
      employeeId: EMPLOYEE,
      terminationDate: '10/08/2026',
    })

    expect(result.ok).toBe(false)
    expect(setEmployeeTermination).not.toHaveBeenCalled()
  })
})

describe('a recusa da regra chega com o motivo', () => {
  it('anterior à admissão diz QUAL data conferir', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    setEmployeeTermination.mockRejectedValue(
      new TeamRepositoryError('termination-before-hire', 'recusado'),
    )

    const result = await terminateEmployeeAction(input)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe(employeeMessages.terminationBeforeHire)
    }

    spy.mockRestore()
  })

  it('data futura explica por que o produto não a aceita', async () => {
    /*
     * "Data inválida" mandaria adivinhar. A mensagem diz que o sistema não tem
     * como virar o vínculo no dia marcado — e o que fazer no lugar.
     */
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    setEmployeeTermination.mockRejectedValue(
      new TeamRepositoryError('termination-in-future', 'recusado'),
    )

    const result = await terminateEmployeeAction(input)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe(employeeMessages.terminationInFuture)
    }

    spy.mockRestore()
  })
})

describe('o que a trilha registra', () => {
  it('desligamento guarda a DATA — nunca o nome', async () => {
    /*
     * Data de desligamento é informação de gestão e é o que a pergunta da
     * trilha precisa. O nome é dado pessoal, e `audit_log` é append-only e
     * legível pela operação inteira.
     */
    await terminateEmployeeAction(input)

    const event = recordAuditEvent.mock.calls[0][0] as {
      action: string
      after: Record<string, unknown>
    }

    expect(event.action).toBe('employee.terminated')
    expect(event.after).toEqual({ termination_date: '2026-08-10' })
    expect(JSON.stringify(event)).not.toContain('Ana Ribeiro')
  })

  it('reverter é um evento PRÓPRIO', async () => {
    // Com um evento só, a reversão pareceria um desligamento de data nula.
    setEmployeeTermination.mockResolvedValue(
      employee({ isActive: true, terminationDate: null }),
    )

    await reinstateEmployeeAction({ employeeId: EMPLOYEE })

    const event = recordAuditEvent.mock.calls[0][0] as { action: string }

    expect(event.action).toBe('employee.reinstated')
  })
})
