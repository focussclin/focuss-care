import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O portão de pagamento em modo observação — etapa 3.
 *
 * O que este arquivo trava, em ordem de importância:
 *
 *  1. **Ele NÃO bloqueia.** Nesta etapa o portão só mede. Um teste que exigisse
 *     recusa aqui faria a etapa 6 parecer pronta antes de existir.
 *  2. **Falha de leitura LIBERA.** Postgres indisponível não pode virar clínica
 *     parada com paciente na sala de espera.
 *  3. **O log não carrega dado de saúde.** O que se cobra pode dizer o que a
 *     pessoa tem, e este registro é operacional.
 */

const listChargesForAppointment = vi.fn()
vi.mock('@/modules/billing/infrastructure/repository', () => ({
  billingRepositoryFor: () => ({ listChargesForAppointment }),
}))

const { observePaymentGate } = await import('./payment-gate')

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const APPOINTMENT = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f'

const client = { __fake: true } as never

function charge(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invoice-1',
    status: 'draft',
    totalCents: 25_000,
    paidCents: 0,
    payerType: 'patient',
    ...overrides,
  }
}

function observe(step: 'call' | 'start' = 'call', appointmentId: string | null = APPOINTMENT) {
  return observePaymentGate({ client, clinicId: CLINIC, appointmentId, step })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  listChargesForAppointment.mockResolvedValue([])
})

// ---------------------------------------------------------------------------

describe('o que ele responde', () => {
  it('saldo em aberto seria barrado', async () => {
    listChargesForAppointment.mockResolvedValue([charge()])

    const verdict = await observe()

    expect(verdict.wouldBlock).toBe(true)
    expect(verdict.outstandingCents).toBe(25_000)
  })

  it('cobrança quitada não seria barrada', async () => {
    listChargesForAppointment.mockResolvedValue([charge({ paidCents: 25_000 })])

    const verdict = await observe()

    expect(verdict.wouldBlock).toBe(false)
    expect(verdict.outstandingCents).toBe(0)
  })

  it('pagamento parcial ainda seria barrado', async () => {
    listChargesForAppointment.mockResolvedValue([charge({ paidCents: 24_999 })])

    expect((await observe()).wouldBlock).toBe(true)
  })

  it('sem cobrança nenhuma, nada a barrar — é o fluxo de hoje', async () => {
    /*
     * Enquanto a recepção não emitir cobrança ligada ao agendamento, o portão
     * não tem o que dizer. É o que mantém a etapa reversível.
     */
    const verdict = await observe()

    expect(verdict.wouldBlock).toBe(false)
  })

  it('convênio não seria barrado', async () => {
    listChargesForAppointment.mockResolvedValue([charge({ payerType: 'insurance' })])

    expect((await observe()).wouldBlock).toBe(false)
  })

  it('`draft` conta como dívida', async () => {
    // A regra vive em `outstandingCents`; este teste prova que o portão a usa,
    // em vez de ter uma segunda cópia que envelhece sozinha.
    listChargesForAppointment.mockResolvedValue([charge({ status: 'draft' })])

    expect((await observe()).wouldBlock).toBe(true)
  })
})

describe('encaixe', () => {
  it('sem agendamento não consulta o banco', async () => {
    // Não há agendamento a que pendurar cobrança, e cobrar de quem chegou sem
    // hora marcada é outro fluxo.
    const verdict = await observe('call', null)

    expect(verdict.skipped).toBe('walk-in')
    expect(verdict.wouldBlock).toBe(false)
    expect(listChargesForAppointment).not.toHaveBeenCalled()
  })
})

describe('falha de leitura LIBERA', () => {
  it('erro no banco não vira paciente parado', async () => {
    listChargesForAppointment.mockRejectedValue(new Error('postgres fora do ar'))

    const verdict = await observe()

    expect(verdict.wouldBlock).toBe(false)
    expect(verdict.skipped).toBe('unavailable')
  })

  it('nunca lança — quem chama já moveu a fila', async () => {
    listChargesForAppointment.mockRejectedValue(new Error('postgres fora do ar'))

    await expect(observe()).resolves.toBeDefined()
  })
})

describe('o registro', () => {
  it('anota a transição, o valor e quantas cobranças', async () => {
    listChargesForAppointment.mockResolvedValue([
      charge({ id: 'a', totalCents: 25_000 }),
      charge({ id: 'b', totalCents: 10_000 }),
    ])

    await observe('start')

    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('payment-gate'),
      expect.objectContaining({
        step: 'start',
        appointmentId: APPOINTMENT,
        outstandingCents: 35_000,
        charges: 2,
      }),
    )
  })

  it('não anota nada quando não haveria bloqueio', async () => {
    // Um log por chamada de paciente, em toda clínica, para dizer "tudo certo"
    // afogaria o registro que interessa.
    listChargesForAppointment.mockResolvedValue([charge({ paidCents: 25_000 })])

    await observe()

    expect(console.info).not.toHaveBeenCalled()
  })

  it('o registro NÃO carrega paciente nem descrição do item', async () => {
    /*
     * O que se cobra pode dizer o que a pessoa tem. `appointmentId` basta para
     * reconstituir o caso a partir do banco, por quem já tem acesso a ele.
     */
    listChargesForAppointment.mockResolvedValue([charge()])

    await observe()

    const [, payload] = vi.mocked(console.info).mock.calls[0]

    expect(Object.keys(payload as object)).toEqual([
      'step',
      'appointmentId',
      'outstandingCents',
      'charges',
    ])
  })
})

describe('modo observação', () => {
  it('o veredito é informativo — ninguém age sobre ele nesta etapa', async () => {
    /*
     * Este teste é um marcador deliberado. Quando a etapa 6 ligar a recusa, ela
     * NÃO acontece aqui dentro: o portão continua respondendo, e quem passa a
     * agir é o handler de `call` e `start`. Se alguém puser o bloqueio neste
     * arquivo, a mudança fica visível em vez de silenciosa.
     */
    listChargesForAppointment.mockResolvedValue([charge()])

    const verdict = await observe()

    expect(verdict).toEqual({
      outstandingCents: 25_000,
      wouldBlock: true,
      skipped: null,
    })
  })
})
