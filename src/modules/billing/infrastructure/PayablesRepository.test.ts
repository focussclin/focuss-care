import { describe, expect, it, vi } from 'vitest'

import { SupabaseBillingRepository } from './SupabaseBillingRepository'

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const PAYABLE = '9019956f-bdd8-4d61-868d-09b02332dad0'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'

interface Call {
  table: string
  method: string
  args: unknown[]
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: PAYABLE,
    description: 'Aluguel da sala',
    category: 'Estrutura',
    supplier: 'Imobiliária',
    amount_cents: 125000,
    due_date: '2026-08-15',
    paid_at: null,
    paid_amount_cents: null,
    method: null,
    is_recurring: true,
    notes: null,
    created_at: '2026-08-01T12:00:00.000Z',
    ...overrides,
  }
}

function fakeClient(options: { rows?: unknown[]; current?: unknown }) {
  const calls: Call[] = []
  const from = vi.fn((table: string) => {
    const query: Record<string, unknown> = {}
    const own = () => calls.filter((call) => call.table === table)
    const has = (method: string) => own().some((call) => call.method === method)

    for (const method of [
      'select',
      'eq',
      'lte',
      'order',
      'limit',
      'insert',
      'update',
      'is',
    ]) {
      query[method] = (...args: unknown[]) => {
        calls.push({ table, method, args })
        return query
      }
    }

    query.single = async () => ({
      data: options.current ?? row(),
      error: null,
    })

    query.maybeSingle = async () => ({
      data: has('update') ? options.current ?? row() : options.current ?? row(),
      error: null,
    })

    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({
        data: options.rows ?? [],
        error: null,
      }).then(onFulfilled, onRejected)

    return query
  })

  return { calls, client: { from } as never }
}

describe('contas a pagar', () => {
  it('lista apenas o tenant e traduz o vencimento', async () => {
    const fake = fakeClient({ rows: [row({ due_date: '2000-01-01' })] })

    const payables = await new SupabaseBillingRepository(fake.client).listPayables(
      CLINIC,
      new Date('2027-01-01T00:00:00.000Z'),
    )

    expect(payables[0]).toMatchObject({
      id: PAYABLE,
      amountCents: 125000,
      status: 'overdue',
      paidAmountCents: 0,
    })
    expect(fake.calls).toContainEqual({
      table: 'payables',
      method: 'eq',
      args: ['clinic_id', CLINIC],
    })
  })

  it('cria despesa sem aceitar total derivado da tela', async () => {
    const fake = fakeClient({})

    await new SupabaseBillingRepository(fake.client).createPayable(
      CLINIC,
      {
        description: 'Licença de software',
        category: 'Tecnologia',
        supplier: 'Fornecedor',
        amountCents: 4990,
        dueDate: new Date(2026, 7, 20),
        isRecurring: true,
        notes: null,
      },
      USER,
    )

    const insert = fake.calls.find(
      (call) => call.table === 'payables' && call.method === 'insert',
    )
    expect(insert?.args[0]).toMatchObject({
      clinic_id: CLINIC,
      amount_cents: 4990,
      created_by: USER,
    })
  })

  it('baixa pelo valor persistido e recusa repetir uma baixa', async () => {
    const fake = fakeClient({
      current: row({ amount_cents: 8700 }),
    })

    await new SupabaseBillingRepository(fake.client).settlePayable(CLINIC, {
      payableId: PAYABLE,
      method: 'pix',
    })

    const update = fake.calls.find(
      (call) => call.table === 'payables' && call.method === 'update',
    )
    expect(update?.args[0]).toMatchObject({
      paid_amount_cents: 8700,
      method: 'pix',
    })
    expect(fake.calls).toContainEqual({
      table: 'payables',
      method: 'is',
      args: ['paid_at', null],
    })

    const paid = fakeClient({ current: row({ paid_at: '2026-08-10T10:00:00.000Z' }) })
    await expect(
      new SupabaseBillingRepository(paid.client).settlePayable(CLINIC, {
        payableId: PAYABLE,
        method: 'pix',
      }),
    ).rejects.toMatchObject({ reason: 'payable-paid' })
    expect(
      paid.calls.some((call) => call.method === 'update'),
    ).toBe(false)
  })
})
