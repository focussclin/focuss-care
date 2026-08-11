import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A fila move a agenda — e nunca o contrário.
 *
 * O que este arquivo protege é a parte que não pode falhar alto: o paciente
 * chegou, e a chegada não se desfaz porque a agenda não pôde ser carimbada.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const APPOINTMENT = '9019956f-bdd8-4d61-868d-09b02332dad0'

const markProgress = vi.fn()
vi.mock('@/modules/scheduling/infrastructure/repository', () => ({
  appointmentRepositoryFor: () => ({ markProgress }),
}))

const { syncAppointmentProgress } = await import('./appointment-progress')
const { AppointmentRepositoryError } = await import(
  '@/modules/scheduling/domain/AppointmentRepositoryError'
)

const client = { __fake: true } as never

function sync(overrides: Record<string, unknown> = {}) {
  return syncAppointmentProgress({
    client,
    clinicId: CLINIC,
    appointmentId: APPOINTMENT,
    progress: 'checked_in',
    userId: USER,
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  markProgress.mockResolvedValue({ id: APPOINTMENT })
})

describe('o carimbo', () => {
  it('vai para o agendamento da clínica ativa, com quem agiu', async () => {
    const outcome = await sync()

    expect(outcome).toEqual({ synced: true })
    // A clínica sai do `ActionContext`; o usuário vai para
    // `appointment_status_history`.
    expect(markProgress).toHaveBeenCalledWith(
      CLINIC,
      APPOINTMENT,
      'checked_in',
      USER,
    )
  })

  it('o início do atendimento usa o outro destino', async () => {
    await sync({ progress: 'in_progress' })

    expect(markProgress).toHaveBeenCalledWith(
      CLINIC,
      APPOINTMENT,
      'in_progress',
      USER,
    )
  })
})

describe('encaixe', () => {
  it('sem agendamento, não há agenda a mover — e isso não é falha', async () => {
    /*
     * Chegada sem hora marcada é rotina de clínica. A fila aceita, e tentar
     * carimbar um agendamento inexistente produziria um erro por operação
     * normal.
     */
    const outcome = await sync({ appointmentId: null })

    expect(outcome).toEqual({ synced: false, reason: 'walk-in' })
    expect(markProgress).not.toHaveBeenCalled()
  })
})

describe('falha não derruba a fila', () => {
  it('agenda já com desfecho registrado vira `stale-status`, não exceção', async () => {
    /*
     * É o caso ESPERADO, não um defeito: o atendimento foi cancelado ou já teve
     * desfecho enquanto a pessoa esperava. Os três terminais não voltam.
     */
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    markProgress.mockRejectedValue(
      new AppointmentRepositoryError(
        'stale-status',
        'o atendimento mudou de estado',
      ),
    )

    const outcome = await sync()

    expect(outcome).toEqual({ synced: false, reason: 'stale-status' })
    spy.mockRestore()
  })

  it.each([
    ['not-found', 'not-found'],
    ['forbidden', 'forbidden'],
    ['unavailable', 'unavailable'],
  ] as const)('%s vira motivo próprio', async (reason, expected) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    markProgress.mockRejectedValue(
      new AppointmentRepositoryError(reason, 'recusado'),
    )

    const outcome = await sync()

    expect(outcome).toEqual({ synced: false, reason: expected })
    spy.mockRestore()
  })

  it('erro desconhecido não escapa', async () => {
    // Em demonstração o repositório recusa a escrita; a fila não pode quebrar
    // por causa disso.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    markProgress.mockRejectedValue(new Error('sem banco'))

    const outcome = await sync()

    expect(outcome).toEqual({ synced: false, reason: 'unavailable' })
    spy.mockRestore()
  })

  it('o log não carrega paciente, motivo nem mensagem do banco', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    markProgress.mockRejectedValue(
      new AppointmentRepositoryError(
        'unexpected',
        'coluna reason: dor no peito de Maria Souza',
      ),
    )

    await sync()

    const logged = JSON.stringify(spy.mock.calls)
    expect(logged).not.toContain('Maria Souza')
    expect(logged).not.toContain('dor no peito')
    expect(logged).toContain('checked_in')

    spy.mockRestore()
  })
})
