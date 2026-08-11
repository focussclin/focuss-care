import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A fila carimba a agenda — feature **A-04**.
 *
 * §8.34 deixou o limite escrito: `checked_in` e `in_progress` eram inalcançáveis
 * porque quem move o paciente pela fila é este módulo, e ele não tocava em
 * `appointments.status`. A agenda dizia "Agendado" sobre alguém já na sala.
 *
 * O que se prova aqui é o contrato do efeito: para onde ele vai, de qual
 * agendamento, e que ele acontece DEPOIS da resposta — nunca no caminho crítico
 * da chegada.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const PATIENT = '22222222-2222-4222-8222-222222222222'
const APPOINTMENT = '9019956f-bdd8-4d61-868d-09b02332dad0'
const QUEUE_ENTRY = '44444444-4444-4444-8444-444444444444'
const PROFESSIONAL = '55555555-5555-4555-8555-555555555555'

vi.mock('next/cache', () => ({ updateTag: () => {}, revalidatePath: () => {} }))

/**
 * `after` roda o callback aqui para o teste poder observá-lo.
 *
 * Em produção ele acontece depois da resposta — é o que tira a sincronização do
 * caminho crítico da chegada.
 */
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

vi.mock('@/lib/audit/audit-log', () => ({
  recordAuditEvent: async () => ({ recorded: false, reason: 'test' }),
}))

vi.mock('@/lib/notifications/operational', () => ({
  createEncounterNotification: async () => {},
}))

const syncAppointmentProgress = vi.fn()
vi.mock('@/lib/scheduling/appointment-progress', () => ({
  syncAppointmentProgress: (input: unknown) => syncAppointmentProgress(input),
}))

const checkIn = vi.fn()
const start = vi.fn()
vi.mock('../infrastructure/repository', () => ({
  encounterRepositoryFor: () => ({ checkIn, start }),
}))

const { checkInAction } = await import('./checkIn.action')
const { startEncounterAction } = await import('./startEncounter.action')

function queueEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: QUEUE_ENTRY,
    patientId: PATIENT,
    patientName: 'Maria Souza',
    appointmentId: APPOINTMENT,
    professionalId: null,
    professionalName: null,
    priority: 'normal' as const,
    reason: null,
    status: 'waiting' as const,
    arrivedAt: new Date('2026-08-11T13:00:00.000Z'),
    calledAt: null,
    ...overrides,
  }
}

function encounter(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    patientId: PATIENT,
    patientName: 'Maria Souza',
    appointmentId: APPOINTMENT,
    professionalId: PROFESSIONAL,
    professionalName: 'Dra. Helena',
    status: 'open' as const,
    chiefComplaint: null,
    // A ENTIDADE guarda `startedAt`; o DTO expõe `startsAt`.
    startedAt: new Date('2026-08-11T13:20:00.000Z'),
    endedAt: null,
    ...overrides,
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
  syncAppointmentProgress.mockResolvedValue({ synced: true })
  checkIn.mockResolvedValue(queueEntry())
  start.mockResolvedValue(encounter())
})

const checkInInput = { patientId: PATIENT, appointmentId: APPOINTMENT }
const startInput = { queueEntryId: QUEUE_ENTRY, professionalId: PROFESSIONAL }

describe('chegada', () => {
  it('carimba `checked_in` no agendamento', async () => {
    const result = await checkInAction(checkInInput)

    expect(result.ok).toBe(true)
    expect(syncAppointmentProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        clinicId: CLINIC,
        appointmentId: APPOINTMENT,
        progress: 'checked_in',
        userId: USER,
      }),
    )
  })

  it('o agendamento vem do OUTPUT, não do formulário', async () => {
    /*
     * `output` é a linha que o repositório devolveu, depois da RLS. Usar a
     * entrada deixaria o navegador escolher qual agendamento carimbar.
     */
    const other = '77777777-7777-4777-8777-777777777777'
    checkIn.mockResolvedValue(queueEntry({ appointmentId: other }))

    await checkInAction(checkInInput)

    expect(syncAppointmentProgress).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: other }),
    )
  })

  it('encaixe chega ao efeito como `null` — quem decide é a composição', async () => {
    // A regra de "não há agenda a mover" mora em um lugar só.
    checkIn.mockResolvedValue(queueEntry({ appointmentId: null }))

    await checkInAction({ patientId: PATIENT })

    expect(syncAppointmentProgress).toHaveBeenCalledWith(
      expect.objectContaining({ appointmentId: null }),
    )
  })
})

describe('início do atendimento', () => {
  it('carimba `in_progress`', async () => {
    const result = await startEncounterAction(startInput)

    expect(result.ok).toBe(true)
    expect(syncAppointmentProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        appointmentId: APPOINTMENT,
        progress: 'in_progress',
        userId: USER,
      }),
    )
  })
})

describe('a chegada não depende da agenda', () => {
  it('agenda recusada não derruba o check-in', async () => {
    /*
     * O paciente chegou. Quem está no balcão viu a pessoa entrar, e a fila não
     * volta atrás porque um `UPDATE` em outra tabela não alcançou linha nenhuma.
     */
    syncAppointmentProgress.mockResolvedValue({
      synced: false,
      reason: 'stale-status',
    })

    const result = await checkInAction(checkInInput)

    expect(result.ok).toBe(true)
  })

  it('escrita da fila acontece ANTES do carimbo', async () => {
    const order: string[] = []
    checkIn.mockImplementation(async () => {
      order.push('fila')
      return queueEntry()
    })
    syncAppointmentProgress.mockImplementation(async () => {
      order.push('agenda')
      return { synced: true }
    })

    await checkInAction(checkInInput)

    // O efeito roda em `afterSuccess`, depois da resposta.
    expect(order).toEqual(['fila', 'agenda'])
  })
})

describe('quem não opera a fila não carimba a agenda', () => {
  it('`finance` é recusado antes de qualquer escrita', async () => {
    sessionState.mockResolvedValue(session('finance'))

    const result = await checkInAction(checkInInput)

    expect(result.ok).toBe(false)
    expect(checkIn).not.toHaveBeenCalled()
    expect(syncAppointmentProgress).not.toHaveBeenCalled()
  })
})
