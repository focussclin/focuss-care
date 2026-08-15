import { describe, expect, it, vi } from 'vitest'

import { SupabaseBillingRepository } from './SupabaseBillingRepository'

/**
 * Contrato do financeiro (B-01).
 *
 * Todas as recusas testadas aqui protegem a mesma coisa: que o registro não
 * minta sobre dinheiro. Pagamento acima do saldo, cobrança cancelada depois de
 * paga, dois caixas abertos e saldo somado em vez de recalculado são erros que
 * ninguém vê acontecer — aparecem semanas depois, na conferência, quando já não
 * se sabe qual linha está errada.
 *
 * Sem banco e sem rede. Tenancy real continua sendo pgTAP (R1).
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const INVOICE = '9019956f-bdd8-4d61-868d-09b02332dad0'
const SESSION = '5f2b1a3c-4d5e-4f60-8a71-9b2c3d4e5f60'
const APPOINTMENT = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f'
const PATIENT = '11111111-1111-4111-8111-111111111111'

interface RecordedCall {
  query: number
  table: string
  method: string
  args: unknown[]
}

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INVOICE,
    patient_id: '11111111-1111-4111-8111-111111111111',
    number: null,
    status: 'draft',
    subtotal_cents: 30000,
    discount_cents: 0,
    total_cents: 30000,
    paid_cents: 0,
    due_date: null,
    notes: null,
    created_at: '2026-08-10T12:00:00.000Z',
    patients: { full_name: 'Marina Costa' },
    invoice_items: [],
    ...overrides,
  }
}

function createFakeClient(results: {
  invoice?: unknown
  searchPatients?: { id: string }[]
  searchInvoices?: unknown[]
  /** Linhas de `payments` devolvidas ao recalcular o saldo. */
  payments?: { amount_cents: number }[]
  /** Sessão de caixa aberta, ou null. */
  openSession?: unknown
  cashEntries?: { kind: string; amount_cents: number }[]
  closedSession?: unknown
  /**
   * A linha devolvida pela consulta de verificação do agendamento.
   *
   * `undefined` é o padrão e vale "não existe nesta clínica" — que é o desfecho
   * que a guarda precisa distinguir do caso em que existe.
   */
  appointment?: { id: string } | null
}) {
  const calls: RecordedCall[] = []
  let queryIndex = -1

  const from = vi.fn((table: string) => {
    queryIndex += 1
    const index = queryIndex

    const query: Record<string, unknown> = {}
    const own = () => calls.filter((call) => call.query === index)
    const usedMethod = (method: string) =>
      own().some((call) => call.method === method)
    const selectArg = () =>
      own().find((call) => call.method === 'select')?.args[0] as
        | string
        | undefined
    const hasEq = (field: string, value: unknown) =>
      own().some(
        (call) =>
          call.method === 'eq' &&
          call.args[0] === field &&
          call.args[1] === value,
      )

    for (const method of [
      'select',
      'eq',
      'neq',
      'in',
      'ilike',
      'gte',
      'lt',
      'order',
      'limit',
      'update',
      'insert',
      'delete',
    ]) {
      query[method] = (...args: unknown[]) => {
        calls.push({ query: index, table, method, args })
        return query
      }
    }

    const resolveSingle = () => {
      if (table === 'invoices') {
        if (usedMethod('insert')) return { id: INVOICE }
        return 'invoice' in results ? results.invoice : invoiceRow()
      }

      if (table === 'payments') {
        return {
          id: 'payment-1',
          invoice_id: INVOICE,
          amount_cents: 10000,
          method: 'cash',
          paid_at: '2026-08-10T13:00:00.000Z',
          notes: null,
        }
      }

      if (table === 'cash_sessions') {
        if (usedMethod('insert')) {
          return {
            id: SESSION,
            status: 'open',
            opened_at: '2026-08-10T08:00:00.000Z',
            opened_by: USER,
            opening_amount_cents: 10000,
          }
        }

        if (usedMethod('update')) {
          return (
            results.closedSession ?? {
              id: SESSION,
              status: 'closed',
              opened_at: '2026-08-10T08:00:00.000Z',
              opened_by: USER,
              opening_amount_cents: 10000,
              closed_at: '2026-08-10T18:00:00.000Z',
              expected_amount_cents: 0,
              counted_amount_cents: 0,
              difference_cents: 0,
              notes: null,
            }
          )
        }

        // `requireOpenSession` pede só a abertura.
        if (selectArg() === 'opening_amount_cents') {
          return 'openSession' in results && results.openSession === null
            ? null
            : { opening_amount_cents: 10000 }
        }

        return 'openSession' in results
          ? results.openSession
          : {
              id: SESSION,
              status: 'open',
              opened_at: '2026-08-10T08:00:00.000Z',
              opened_by: USER,
              opening_amount_cents: 10000,
              closed_at: null,
              expected_amount_cents: null,
              counted_amount_cents: null,
              difference_cents: null,
              notes: null,
            }
      }

      if (table === 'cash_entries') {
        return {
          id: 'entry-1',
          kind: 'out',
          amount_cents: 5000,
          description: 'Sangria',
          category: null,
          payment_id: null,
          created_at: '2026-08-10T14:00:00.000Z',
        }
      }

      if (table === 'profiles') return { full_name: 'Ana Ribeiro' }

      if (table === 'appointments') return results.appointment ?? null

      return null
    }

    query.single = async () => {
      calls.push({ query: index, table, method: 'single', args: [] })
      return { data: resolveSingle(), error: null }
    }

    query.maybeSingle = async () => {
      calls.push({ query: index, table, method: 'maybeSingle', args: [] })
      return { data: resolveSingle(), error: null }
    }

    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      let data: unknown = []

      if (table === 'patients') data = results.searchPatients ?? []
      if (table === 'payments') data = results.payments ?? []
      if (table === 'cash_entries') data = results.cashEntries ?? []
      if (table === 'invoices' && usedMethod('in')) {
        data = results.searchInvoices ?? []
      }
      if (table === 'invoices' && hasEq('clinic_id', CLINIC) && !usedMethod('in')) {
        data = []
      }

      return Promise.resolve({ data, count: 0, error: null }).then(
        onFulfilled,
        onRejected,
      )
    }

    return query
  })

  return {
    calls,
    client: { from } as never,
    ofTable: (table: string) => calls.filter((call) => call.table === table),
  }
}

describe('searchInvoicesByPatientName', () => {
  it('separa a busca de paciente da cobrança e mantém o tenant', async () => {
    const fake = createFakeClient({
      searchPatients: [{ id: 'patient-1' }],
      searchInvoices: [invoiceRow({ patient_id: 'patient-1' })],
    })

    const invoices = await new SupabaseBillingRepository(
      fake.client,
    ).searchInvoicesByPatientName(CLINIC, 'Marina', 8)

    expect(invoices[0]).toMatchObject({
      id: INVOICE,
      patientName: 'Marina Costa',
      totalCents: 30000,
    })
    expect(fake.ofTable('patients')).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
    )
    expect(fake.ofTable('patients')).toContainEqual(
      expect.objectContaining({ method: 'ilike', args: ['full_name', '%Marina%'] }),
    )
    expect(fake.ofTable('invoices')).toContainEqual(
      expect.objectContaining({ method: 'in', args: ['patient_id', ['patient-1']] }),
    )
  })
})

describe('registerPayment', () => {
  it('recusa valor acima do saldo devedor', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({
      invoice: invoiceRow({ total_cents: 10000, paid_cents: 0 }),
    })

    await expect(
      new SupabaseBillingRepository(fake.client).registerPayment(
        CLINIC,
        {
          invoiceId: INVOICE,
          amountCents: 100000,
          method: 'pix',
          notes: null,
        },
        USER,
      ),
    ).rejects.toMatchObject({ reason: 'overpayment' })

    // Recusa ANTES de gravar: R$ 1.000 no lugar de R$ 100 nao vira credito que
    // o sistema nao sabe devolver.
    expect(
      fake.ofTable('payments').some((call) => call.method === 'insert'),
    ).toBe(false)

    spy.mockRestore()
  })

  it('aceita pagamento parcial', async () => {
    const fake = createFakeClient({
      invoice: invoiceRow({ total_cents: 30000, paid_cents: 10000 }),
      payments: [{ amount_cents: 10000 }, { amount_cents: 5000 }],
    })

    await new SupabaseBillingRepository(fake.client).registerPayment(
      CLINIC,
      { invoiceId: INVOICE, amountCents: 5000, method: 'pix', notes: null },
      USER,
    )

    const update = fake
      .ofTable('invoices')
      .find((call) => call.method === 'update')?.args[0] as Record<
      string,
      unknown
    >

    expect(update.paid_cents).toBe(15000)
    expect(update.status).toBe('partially_paid')
  })

  it('RECALCULA o saldo da soma dos pagamentos, em vez de somar ao anterior', async () => {
    const fake = createFakeClient({
      invoice: invoiceRow({ total_cents: 30000, paid_cents: 25000 }),
      // O banco tem apenas estes dois pagamentos: 20000, e nao 25000 + 5000.
      payments: [{ amount_cents: 15000 }, { amount_cents: 5000 }],
    })

    await new SupabaseBillingRepository(fake.client).registerPayment(
      CLINIC,
      { invoiceId: INVOICE, amountCents: 5000, method: 'pix', notes: null },
      USER,
    )

    const update = fake
      .ofTable('invoices')
      .find((call) => call.method === 'update')?.args[0] as Record<
      string,
      unknown
    >

    // Somar sobre o valor anterior transformaria uma requisicao repetida em
    // dinheiro duplicado. Recalcular faz a repeticao ser inocua.
    expect(update.paid_cents).toBe(20000)
  })

  it('quita a cobrança quando a soma alcança o total', async () => {
    const fake = createFakeClient({
      invoice: invoiceRow({ total_cents: 30000, paid_cents: 0 }),
      payments: [{ amount_cents: 30000 }],
    })

    await new SupabaseBillingRepository(fake.client).registerPayment(
      CLINIC,
      { invoiceId: INVOICE, amountCents: 30000, method: 'pix', notes: null },
      USER,
    )

    const update = fake
      .ofTable('invoices')
      .find((call) => call.method === 'update')?.args[0] as Record<
      string,
      unknown
    >

    expect(update.status).toBe('paid')
  })

  it('pagamento em dinheiro vira lançamento no caixa aberto', async () => {
    const fake = createFakeClient({
      invoice: invoiceRow({ total_cents: 30000, paid_cents: 0 }),
      payments: [{ amount_cents: 10000 }],
    })

    await new SupabaseBillingRepository(fake.client).registerPayment(
      CLINIC,
      { invoiceId: INVOICE, amountCents: 10000, method: 'cash', notes: null },
      USER,
    )

    const entry = fake
      .ofTable('cash_entries')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    // Sem isso, o turno fecharia com diferenca do tamanho de tudo o que entrou
    // em dinheiro — e a diferenca deixaria de significar alguma coisa.
    expect(entry).toBeDefined()
    expect(entry.kind).toBe('in')
    expect(entry.amount_cents).toBe(10000)
    expect(entry.payment_id).toBe('payment-1')
  })

  it('pagamento em pix NÃO toca no caixa', async () => {
    const fake = createFakeClient({
      invoice: invoiceRow({ total_cents: 30000, paid_cents: 0 }),
      payments: [{ amount_cents: 10000 }],
    })

    await new SupabaseBillingRepository(fake.client).registerPayment(
      CLINIC,
      { invoiceId: INVOICE, amountCents: 10000, method: 'pix', notes: null },
      USER,
    )

    expect(fake.ofTable('cash_entries')).toHaveLength(0)
  })
})

describe('cancelInvoice', () => {
  it('recusa cancelar cobrança que já recebeu pagamento', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({
      invoice: invoiceRow({ paid_cents: 5000 }),
    })

    await expect(
      new SupabaseBillingRepository(fake.client).cancelInvoice(
        CLINIC,
        INVOICE,
        null,
      ),
    ).rejects.toMatchObject({ reason: 'invoice-paid' })

    spy.mockRestore()
  })

  it('cancela SEM apagar, e não cancela duas vezes', async () => {
    const fake = createFakeClient({ invoice: invoiceRow({ paid_cents: 0 }) })

    await new SupabaseBillingRepository(fake.client).cancelInvoice(
      CLINIC,
      INVOICE,
      'paciente desistiu',
    )

    const calls = fake.ofTable('invoices')

    expect(calls.some((call) => call.method === 'delete')).toBe(false)
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'neq', args: ['status', 'canceled'] }),
    )

    const update = calls.find((call) => call.method === 'update')
      ?.args[0] as Record<string, unknown>

    expect(update.status).toBe('canceled')
    expect(update.canceled_at).toBeTypeOf('string')
  })
})

describe('createInvoice', () => {
  it('calcula os totais no SERVIDOR, a partir de quantidade e preço', async () => {
    const fake = createFakeClient({})

    await new SupabaseBillingRepository(fake.client).createInvoice(
      CLINIC,
      {
        patientId: '11111111-1111-4111-8111-111111111111',
        appointmentId: null,
        discountCents: 5000,
        dueDate: null,
        notes: null,
        items: [
          {
            description: 'Consulta',
            quantity: 2,
            unitPriceCents: 15000,
            discountCents: 0,
          },
        ],
      },
      USER,
    )

    const insert = fake
      .ofTable('invoices')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    // 2 x 150,00 = 300,00; menos 50,00 de desconto = 250,00.
    expect(insert.subtotal_cents).toBe(30000)
    expect(insert.total_cents).toBe(25000)
    expect(insert.paid_cents).toBe(0)
  })

  it('nasce em draft, sem número fiscal', async () => {
    const fake = createFakeClient({})

    await new SupabaseBillingRepository(fake.client).createInvoice(
      CLINIC,
      {
        patientId: '11111111-1111-4111-8111-111111111111',
        appointmentId: null,
        discountCents: 0,
        dueDate: null,
        notes: null,
        items: [
          {
            description: 'Consulta',
            quantity: 1,
            unitPriceCents: 15000,
            discountCents: 0,
          },
        ],
      },
      USER,
    )

    const insert = fake
      .ofTable('invoices')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    // `issued` significaria documento fiscal numerado, e a numeracao pertence a
    // `issue_invoice` — fora de alcance (B1). Marcar aqui alegaria uma emissao
    // que nao aconteceu.
    expect(insert.status).toBe('draft')
    expect(insert).not.toHaveProperty('number')
  })

  it('não deixa o item cobrar mais que o combinado quando há desconto por item', async () => {
    const fake = createFakeClient({})

    await new SupabaseBillingRepository(fake.client).createInvoice(
      CLINIC,
      {
        patientId: '11111111-1111-4111-8111-111111111111',
        appointmentId: null,
        discountCents: 0,
        dueDate: null,
        notes: null,
        items: [
          {
            description: 'Procedimento',
            quantity: 1,
            unitPriceCents: 10000,
            discountCents: 12000,
          },
        ],
      },
      USER,
    )

    const insert = fake
      .ofTable('invoices')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    // Desconto maior que o item nao vira cobranca negativa.
    expect(insert.subtotal_cents).toBe(0)
  })

  /**
   * O vínculo com a agenda — etapa 2 de `PAGAMENTO_ANTES_DA_CONSULTA.md`.
   *
   * A coluna `invoices.appointment_id` existe desde o schema original e nunca
   * foi escrita. Sem ela, não há como perguntar se ESTE atendimento está pago,
   * e a regra de pagamento antes da consulta não tem em que se apoiar.
   */
  it('grava o agendamento que originou a cobrança', async () => {
    const fake = createFakeClient({})

    await new SupabaseBillingRepository(fake.client).createInvoice(
      CLINIC,
      {
        patientId: '11111111-1111-4111-8111-111111111111',
        appointmentId: APPOINTMENT,
        discountCents: 0,
        dueDate: null,
        notes: null,
        items: [
          {
            description: 'Consulta',
            quantity: 1,
            unitPriceCents: 25000,
            discountCents: 0,
          },
        ],
      },
      USER,
    )

    const insert = fake
      .ofTable('invoices')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    expect(insert.appointment_id).toBe(APPOINTMENT)
  })

  it('cobrança avulsa continua nascendo sem agendamento', async () => {
    // Produto de balcão, encaixe, acerto posterior: é o caso comum, e ele não
    // pode passar a exigir um horário marcado que não existe.
    const fake = createFakeClient({})

    await new SupabaseBillingRepository(fake.client).createInvoice(
      CLINIC,
      {
        patientId: '11111111-1111-4111-8111-111111111111',
        appointmentId: null,
        discountCents: 0,
        dueDate: null,
        notes: null,
        items: [
          {
            description: 'Curativo',
            quantity: 1,
            unitPriceCents: 5000,
            discountCents: 0,
          },
        ],
      },
      USER,
    )

    const insert = fake
      .ofTable('invoices')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    expect(insert.appointment_id).toBeNull()
  })
})

/**
 * A guarda de tenant do agendamento.
 *
 * `invoices.appointment_id` é FK de coluna única: ela prova que a linha existe
 * em algum lugar do banco, não que pertence a esta clínica nem a este paciente.
 * A RLS protege a linha de `invoices`, não o conteúdo deste campo.
 */
describe('appointmentBelongsTo', () => {
  it('exige clínica E paciente na mesma consulta', async () => {
    /*
     * A segunda condição não é redundante: dentro da mesma clínica, o
     * agendamento de OUTRO paciente também passaria pela FK, e a cobrança
     * apareceria na fila de quem não a deve.
     */
    const fake = createFakeClient({ appointment: { id: APPOINTMENT } })

    await new SupabaseBillingRepository(fake.client).appointmentBelongsTo(
      CLINIC,
      APPOINTMENT,
      PATIENT,
    )

    const chamadas = fake.ofTable('appointments')

    expect(chamadas).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
    )
    expect(chamadas).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['id', APPOINTMENT] }),
    )
    expect(chamadas).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['patient_id', PATIENT] }),
    )
  })

  it('agendamento encontrado devolve verdadeiro', async () => {
    const fake = createFakeClient({ appointment: { id: APPOINTMENT } })

    await expect(
      new SupabaseBillingRepository(fake.client).appointmentBelongsTo(
        CLINIC,
        APPOINTMENT,
        PATIENT,
      ),
    ).resolves.toBe(true)
  })

  it('agendamento de outra clínica devolve falso, e não erro', async () => {
    const fake = createFakeClient({ appointment: null })

    await expect(
      new SupabaseBillingRepository(fake.client).appointmentBelongsTo(
        CLINIC,
        APPOINTMENT,
        PATIENT,
      ),
    ).resolves.toBe(false)
  })

  it('pede só o `id` — não traz dado de agendamento para conferir vínculo', async () => {
    const fake = createFakeClient({ appointment: { id: APPOINTMENT } })

    await new SupabaseBillingRepository(fake.client).appointmentBelongsTo(
      CLINIC,
      APPOINTMENT,
      PATIENT,
    )

    expect(fake.ofTable('appointments')).toContainEqual(
      expect.objectContaining({ method: 'select', args: ['id'] }),
    )
  })
})

describe('caixa', () => {
  it('recusa abrir um segundo caixa', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({})

    await expect(
      new SupabaseBillingRepository(fake.client).openCashSession(
        CLINIC,
        10000,
        USER,
      ),
    ).rejects.toMatchObject({ reason: 'cash-session-conflict' })

    spy.mockRestore()
  })

  it('abre quando não há nenhum aberto', async () => {
    const fake = createFakeClient({ openSession: null })

    const session = await new SupabaseBillingRepository(
      fake.client,
    ).openCashSession(CLINIC, 10000, USER)

    expect(session.openingAmountCents).toBe(10000)
  })

  it('calcula o esperado como abertura + entradas − saídas', async () => {
    const fake = createFakeClient({
      cashEntries: [
        { kind: 'in', amount_cents: 20000 },
        { kind: 'out', amount_cents: 5000 },
      ],
    })

    const open = await new SupabaseBillingRepository(
      fake.client,
    ).currentCashSession(CLINIC)

    // 100,00 de abertura + 200,00 − 50,00 = 250,00.
    expect(open?.expectedCents).toBe(25000)
  })

  it('grava a diferença COMO ESTÁ, inclusive negativa', async () => {
    const fake = createFakeClient({
      cashEntries: [{ kind: 'in', amount_cents: 20000 }],
    })

    await new SupabaseBillingRepository(fake.client).closeCashSession(
      CLINIC,
      SESSION,
      28000,
      USER,
    )

    const update = fake
      .ofTable('cash_sessions')
      .find((call) => call.method === 'update')?.args[0] as Record<
      string,
      unknown
    >

    // Esperado 300,00, contado 280,00: faltam 20,00. Caixa que so fecha certo
    // nao serve para descobrir nada.
    expect(update.expected_amount_cents).toBe(30000)
    expect(update.counted_amount_cents).toBe(28000)
    expect(update.difference_cents).toBe(-2000)
  })

  it('só fecha caixa que está aberto', async () => {
    const fake = createFakeClient({})

    await new SupabaseBillingRepository(fake.client).closeCashSession(
      CLINIC,
      SESSION,
      30000,
      USER,
    )

    // O `where` com status aberto e o que impede dois fechamentos concorrentes
    // de gravarem valores diferentes: o segundo nao encontra linha.
    expect(fake.ofTable('cash_sessions')).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['status', 'open'] }),
    )
  })
})

describe('summary', () => {
  it('"a receber" é o SALDO, e não o total das cobranças em aberto', async () => {
    const fake = createFakeClient({})
    const repository = new SupabaseBillingRepository(fake.client)

    // O fake devolve lista vazia para `invoices`; o que este teste fixa é a
    // consulta: apenas status em aberto entram na conta.
    await repository.summary(CLINIC, new Date(2026, 7, 1), new Date(2026, 7, 13))

    const invoiceCalls = fake.ofTable('invoices')

    expect(invoiceCalls).toContainEqual(
      expect.objectContaining({
        method: 'in',
        args: ['status', ['draft', 'issued', 'partially_paid', 'overdue']],
      }),
    )
  })

  it('filtra sempre pela clínica ativa', async () => {
    const fake = createFakeClient({})

    await new SupabaseBillingRepository(fake.client).summary(
      CLINIC,
      new Date(2026, 7, 1),
      new Date(2026, 7, 13),
    )

    for (const table of ['invoices', 'payments']) {
      expect(fake.ofTable(table)).toContainEqual(
        expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
      )
    }
  })
})
