import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O agendamento que origina a cobrança é conferido NO SERVIDOR — etapa 2 de
 * `PAGAMENTO_ANTES_DA_CONSULTA.md`.
 *
 * **Não há banco, nem rede, nem Next em runtime.**
 *
 * # Por que a checagem existe
 *
 * `appointmentId` chega do cliente, e `invoices.appointment_id` referencia
 * `appointments(id)` por COLUNA ÚNICA. A FK prova que a linha existe em algum
 * lugar do banco — não que existe nesta clínica. A RLS protege a linha de
 * `invoices`, não o conteúdo deste campo.
 *
 * Gravar com o `clinic_id` do contexto não basta: a cobrança ficaria com o
 * tenant certo pendurada no atendimento errado.
 *
 * A armadilha a mais é a mesma de `recordVitals`: dentro da MESMA clínica, o
 * agendamento de outro paciente também passa pela FK — e a cobrança apareceria
 * na fila de quem não a deve, que é exatamente o que a etapa 6 vai consultar
 * para liberar ou barrar alguém.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const PATIENT = '22222222-2222-4222-8222-222222222222'
const APPOINTMENT = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f'
const INVOICE = '9019956f-bdd8-4d61-868d-09b02332dad0'

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

vi.mock('@/lib/audit/audit-log', () => ({
  recordAuditEvent: async () => ({ recorded: false, reason: 'test' }),
}))

vi.mock('@/lib/notifications/operational', () => ({
  createBillingNotification: async () => {},
}))

const appointmentBelongsTo = vi.fn()
const createInvoice = vi.fn()
vi.mock('../infrastructure/repository', () => ({
  billingRepositoryFor: () => ({ appointmentBelongsTo, createInvoice }),
}))

const { createInvoiceAction } = await import('./createInvoice.action')
const { billingMessages } = await import('../schemas/billing.schema')

function invoice() {
  return {
    id: INVOICE,
    patientId: PATIENT,
    patientName: 'Maria Silva',
    appointmentId: APPOINTMENT,
    number: null,
    status: 'draft' as const,
    subtotalCents: 25000,
    discountCents: 0,
    totalCents: 25000,
    paidCents: 0,
    dueDate: null,
    notes: null,
    createdAt: new Date('2026-08-14T13:00:00.000Z'),
    items: [],
    payments: [],
  }
}

function session(role: string | null = 'admin') {
  return {
    status: 'active' as const,
    user: { id: USER, email: null, displayName: 'Teste', avatarUrl: null },
    clinicId: CLINIC,
    clinicName: null,
    clinicStatus: 'active' as const,
    role,
  }
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    patientId: PATIENT,
    appointmentId: APPOINTMENT,
    discount: '0',
    items: [{ description: 'Consulta', quantity: '1', unitPrice: '250,00', discount: '0' }],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.mockResolvedValue(session())
  appointmentBelongsTo.mockResolvedValue(true)
  createInvoice.mockResolvedValue(invoice())
})

// ---------------------------------------------------------------------------

describe('vínculo com a agenda', () => {
  it('confere o agendamento contra a clínica E o paciente da sessão', async () => {
    await createInvoiceAction(input())

    expect(appointmentBelongsTo).toHaveBeenCalledWith(CLINIC, APPOINTMENT, PATIENT)
  })

  it('a clínica sai do CONTEXTO, nunca da entrada', async () => {
    /*
     * P3: `clinicId` não tem por onde chegar do cliente. Mandá-lo junto não
     * pode mudar contra qual clínica a conferência acontece.
     */
    await createInvoiceAction(input({ clinicId: 'outra-clinica' }))

    expect(appointmentBelongsTo).toHaveBeenCalledWith(CLINIC, APPOINTMENT, PATIENT)
  })

  it('grava o vínculo quando a conferência passa', async () => {
    const result = await createInvoiceAction(input())

    expect(result.ok).toBe(true)
    expect(createInvoice).toHaveBeenCalledWith(
      CLINIC,
      expect.objectContaining({ appointmentId: APPOINTMENT, patientId: PATIENT }),
      USER,
    )
  })
})

describe('agendamento que não é desta clínica ou deste paciente', () => {
  it('não grava a cobrança', async () => {
    appointmentBelongsTo.mockResolvedValue(false)

    const result = await createInvoiceAction(input())

    expect(result.ok).toBe(false)
    expect(createInvoice).not.toHaveBeenCalled()
  })

  it('a mensagem não revela se o agendamento existe em outro lugar', async () => {
    /*
     * Quem manda um id que não é seu não deve descobrir daqui se ele existe em
     * outra clínica — a recusa é a mesma nos dois casos.
     */
    appointmentBelongsTo.mockResolvedValue(false)

    const result = await createInvoiceAction(input())

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('not-found')
      expect(result.error.message).toBe(billingMessages.appointmentMismatch)
    }
  })
})

describe('cobrança avulsa', () => {
  it('sem agendamento não chama a conferência', async () => {
    // Produto de balcão e acerto posterior são o caso comum. Uma consulta a
    // mais por cobrança avulsa seria custo sem pergunta a responder.
    const result = await createInvoiceAction(input({ appointmentId: undefined }))

    expect(result.ok).toBe(true)
    expect(appointmentBelongsTo).not.toHaveBeenCalled()
  })

  it('campo vazio do formulário conta como sem agendamento', async () => {
    /*
     * O formulário manda `''` quando o campo existe e ninguém escolheu.
     * Tratá-lo como uuid inválido reprovaria uma cobrança que está correta.
     */
    const result = await createInvoiceAction(input({ appointmentId: '' }))

    expect(result.ok).toBe(true)
    expect(appointmentBelongsTo).not.toHaveBeenCalled()
    expect(createInvoice).toHaveBeenCalledWith(
      CLINIC,
      expect.objectContaining({ appointmentId: null }),
      USER,
    )
  })

  it('id malformado é recusado na validação, sem consultar o banco', async () => {
    const result = await createInvoiceAction(input({ appointmentId: 'nao-e-uuid' }))

    expect(result.ok).toBe(false)
    expect(appointmentBelongsTo).not.toHaveBeenCalled()
    expect(createInvoice).not.toHaveBeenCalled()
  })
})

describe('a conferência acontece depois da autorização', () => {
  it('quem não pode cobrar não descobre se o agendamento existe', async () => {
    /*
     * `rolesWith('invoice.write')` roda no pipeline, antes do handler. Sem essa
     * ordem, a recusa por papel viraria um oráculo de existência de
     * agendamento para quem nem pode emitir cobrança.
     */
    sessionState.mockResolvedValue(session('professional'))

    const result = await createInvoiceAction(input())

    expect(result.ok).toBe(false)
    expect(appointmentBelongsTo).not.toHaveBeenCalled()
  })

  it('RECEPCIONISTA emite cobrança — é ela quem recebe o paciente', async () => {
    /*
     * Mudou em 14/08/2026 junto com o fluxo: quem faz o check-in é quem cobra.
     * Ver a justificativa em `permissions.ts`.
     */
    sessionState.mockResolvedValue(session('receptionist'))

    const result = await createInvoiceAction(input())

    expect(result.ok).toBe(true)
    expect(createInvoice).toHaveBeenCalled()
  })
})

/**
 * Desconto é permissão à parte.
 *
 * A checagem não pode estar no `roles` da action: `roles` decide quem pode
 * EXECUTAR, e abater valor é condição sobre a ENTRADA. Pôr `invoice.discount`
 * ali tiraria da recepção o direito de emitir qualquer cobrança.
 */
describe('desconto', () => {
  it('recepção emite pelo valor cheio', async () => {
    sessionState.mockResolvedValue(session('receptionist'))

    const result = await createInvoiceAction(input({ discount: '0' }))

    expect(result.ok).toBe(true)
  })

  it('recepção NÃO abate no rodapé', async () => {
    sessionState.mockResolvedValue(session('receptionist'))

    const result = await createInvoiceAction(input({ discount: '50,00' }))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('forbidden')
      expect(result.error.message).toBe(billingMessages.discountForbidden)
    }
    expect(createInvoice).not.toHaveBeenCalled()
  })

  it('nem pelo item — o dinheiro abatido é o mesmo', async () => {
    /*
     * A regra que só olhasse o rodapé seria contornada pelo formulário:
     * descontar R$ 150 num item de R$ 250 abate o mesmo que descontar R$ 150
     * embaixo.
     */
    sessionState.mockResolvedValue(session('receptionist'))

    const result = await createInvoiceAction(
      input({
        discount: '0',
        items: [
          {
            description: 'Consulta',
            quantity: '1',
            unitPrice: '250,00',
            discount: '150,00',
          },
        ],
      }),
    )

    expect(result.ok).toBe(false)
    expect(createInvoice).not.toHaveBeenCalled()
  })

  it('quem tem a permissão abate', async () => {
    sessionState.mockResolvedValue(session('admin'))

    const result = await createInvoiceAction(input({ discount: '50,00' }))

    expect(result.ok).toBe(true)
    expect(createInvoice).toHaveBeenCalledWith(
      CLINIC,
      expect.objectContaining({ discountCents: 5000 }),
      USER,
    )
  })
})
