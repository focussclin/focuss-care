import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Confirmação e desfecho — feature **A-03**.
 *
 * **Não há banco, nem rede, nem Next em runtime.**
 *
 * O que estas duas actions precisam acertar não é a escrita — isso é do adapter.
 * É a fronteira: o status de destino **não vem do cliente**, e as duas exigem
 * permissões diferentes porque são decisões diferentes.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const APPOINTMENT = '9019956f-bdd8-4d61-868d-09b02332dad0'
const PATIENT = '11111111-1111-4111-8111-111111111111'

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

/*
 * O parametro precisa ser DECLARADO no `vi.fn`: sem ele `mock.calls` e tipado
 * como `[]` e `calls[0][0]` nao existe para o typecheck.
 */
const recordAuditEvent = vi.fn(
  async (event: unknown): Promise<{ recorded: false; reason: string }> => {
    void event
    return { recorded: false, reason: 'test' }
  },
)
vi.mock('@/lib/audit/audit-log', () => ({
  recordAuditEvent: (event: unknown) => recordAuditEvent(event),
}))

const confirm = vi.fn()
const recordOutcome = vi.fn()
vi.mock('../infrastructure/repository', () => ({
  appointmentRepositoryFor: () => ({ confirm, recordOutcome }),
}))

const { confirmAppointmentAction, recordAppointmentOutcomeAction } = await import(
  './appointmentLifecycle.action'
)
const { scheduleMessages } = await import('../schemas/appointment.schema')

function appointment(status = 'confirmed') {
  return {
    id: APPOINTMENT,
    patientId: PATIENT,
    patientName: 'Marina Costa',
    professionalId: '22222222-2222-4222-8222-222222222222',
    professionalName: 'Dra. Helena',
    type: 'Consulta',
    status,
    startsAt: new Date('2026-08-10T13:00:00.000Z'),
    durationMinutes: 30,
    notes: null,
  }
}

function session(role: string | null = 'receptionist') {
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
  confirm.mockResolvedValue(appointment('confirmed'))
  recordOutcome.mockResolvedValue(appointment('no_show'))
})

/**
 * `appointment.write` e `appointment.cancel` resolvem para os MESMOS quatro
 * papéis hoje — só `finance` fica de fora dos dois. Estes casos travam esse
 * fato: se a matriz de I-05 separar os dois amanhã, é aqui que a diferença
 * aparece, em vez de numa tela onde alguém deixou de conseguir confirmar.
 */
describe('quem confirma', () => {
  it.each(['owner', 'admin', 'receptionist', 'professional'])('%s confirma', async (role) => {
    sessionState.mockResolvedValue(session(role))

    const result = await confirmAppointmentAction({ appointmentId: APPOINTMENT })

    expect(result.ok).toBe(true)
  })

  it('finance não confirma', async () => {
    sessionState.mockResolvedValue(session('finance'))

    const result = await confirmAppointmentAction({ appointmentId: APPOINTMENT })

    expect(result.ok).toBe(false)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('a clínica e o autor vêm do contexto, nunca do formulário', async () => {
    await confirmAppointmentAction({
      appointmentId: APPOINTMENT,
      clinicId: 'outra-clinica',
      confirmedBy: 'outra-pessoa',
    })

    expect(confirm).toHaveBeenCalledWith(CLINIC, APPOINTMENT, USER)
  })
})

/**
 * `no_show` devolve o horário à agenda e entra na taxa de comparecimento da
 * clínica — é a mesma classe de decisão do cancelamento, não a de marcar.
 */
describe('quem registra desfecho', () => {
  it.each(['owner', 'admin', 'receptionist', 'professional'])('%s registra', async (role) => {
    sessionState.mockResolvedValue(session(role))

    const result = await recordAppointmentOutcomeAction({
      appointmentId: APPOINTMENT,
      outcome: 'no_show',
    })

    expect(result.ok).toBe(true)
  })

  it('finance não registra', async () => {
    sessionState.mockResolvedValue(session('finance'))

    const result = await recordAppointmentOutcomeAction({
      appointmentId: APPOINTMENT,
      outcome: 'completed',
    })

    expect(result.ok).toBe(false)
    expect(recordOutcome).not.toHaveBeenCalled()
  })
})

/**
 * O contrato do desfecho é um enum de DOIS valores, e não `AppointmentStatus`.
 */
describe('o cliente não escolhe qualquer status', () => {
  it.each(['canceled', 'in_progress', 'checked_in', 'scheduled', 'confirmed'])(
    '%s é recusado como desfecho',
    async (outcome) => {
      /*
       * `canceled` é o que mais importa aqui: aceitá-lo daria um caminho para
       * cancelar sem gravar motivo e sem notificar, pulando a action que faz as
       * duas coisas.
       */
      const result = await recordAppointmentOutcomeAction({
        appointmentId: APPOINTMENT,
        outcome,
      })

      expect(result.ok).toBe(false)
      expect(recordOutcome).not.toHaveBeenCalled()
    },
  )

  it.each(['completed', 'no_show'])('%s é aceito', async (outcome) => {
    const result = await recordAppointmentOutcomeAction({
      appointmentId: APPOINTMENT,
      outcome,
    })

    expect(result.ok).toBe(true)
    expect(recordOutcome).toHaveBeenCalledWith(CLINIC, APPOINTMENT, outcome, USER)
  })

  it('confirmar não aceita status nenhum — só o id', async () => {
    // Aceitá-lo transformaria a action de confirmar numa de escrever qualquer
    // status, e a máquina de estados passaria a depender do navegador.
    await confirmAppointmentAction({ appointmentId: APPOINTMENT, status: 'completed' })

    expect(confirm).toHaveBeenCalledWith(CLINIC, APPOINTMENT, USER)
  })
})

describe('trilha de auditoria', () => {
  it('confirmar e faltar são eventos distintos', async () => {
    await confirmAppointmentAction({ appointmentId: APPOINTMENT })
    expect(
      (recordAuditEvent.mock.calls[0][0] as { action: string }).action,
    ).toBe('appointment.confirmed')

    vi.clearAllMocks()
    recordOutcome.mockResolvedValue(appointment('no_show'))

    await recordAppointmentOutcomeAction({
      appointmentId: APPOINTMENT,
      outcome: 'no_show',
    })
    expect(
      (recordAuditEvent.mock.calls[0][0] as { action: string }).action,
    ).toBe('appointment.no_show')
  })

  it('comparecimento tem ação própria', async () => {
    // Quem audita procura pela falta; procurar por ação é o que a tela oferece.
    recordOutcome.mockResolvedValue(appointment('completed'))

    await recordAppointmentOutcomeAction({
      appointmentId: APPOINTMENT,
      outcome: 'completed',
    })

    expect(
      (recordAuditEvent.mock.calls[0][0] as { action: string }).action,
    ).toBe('appointment.completed')
  })

  it('o nome do paciente não entra no evento', async () => {
    await confirmAppointmentAction({ appointmentId: APPOINTMENT })

    expect(JSON.stringify(recordAuditEvent.mock.calls[0][0])).not.toContain('Marina')
  })
})

describe('recusas do banco chegam legíveis', () => {
  it('estado obsoleto diz QUAL é o estado atual', async () => {
    const { AppointmentRepositoryError } = await import(
      '../domain/AppointmentRepositoryError'
    )
    confirm.mockRejectedValue(
      new AppointmentRepositoryError(
        'stale-status',
        'mudou',
        undefined,
        undefined,
        'canceled',
      ),
    )

    const result = await confirmAppointmentAction({ appointmentId: APPOINTMENT })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      // O rótulo em pt-BR, não o valor cru do enum.
      expect(result.error.message).toContain('Cancelado')
      expect(result.error.code).toBe('conflict')
    }
  })

  it('desfecho antecipado explica a regra', async () => {
    const { AppointmentRepositoryError } = await import(
      '../domain/AppointmentRepositoryError'
    )
    recordOutcome.mockRejectedValue(
      new AppointmentRepositoryError('outcome-too-early', 'cedo demais'),
    )

    const result = await recordAppointmentOutcomeAction({
      appointmentId: APPOINTMENT,
      outcome: 'no_show',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe(scheduleMessages.outcomeTooEarly)
  })
})
