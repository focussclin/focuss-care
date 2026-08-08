import { describe, expect, it, vi } from 'vitest'

import { SupabaseSubscriptionRepository } from './SupabaseSubscriptionRepository'

/**
 * Contrato da leitura de assinatura.
 *
 * O caso que mais importa é o da clínica **sem** assinatura: ela é a maioria
 * hoje, e devolver erro ali transformaria uma ausência normal numa tela
 * quebrada. O segundo é o tenant — `plans` é catálogo global, então o recorte
 * precisa vir de `subscriptions`, e é fácil escrever a consulta ao contrário.
 *
 * Sem banco e sem rede.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'

interface RecordedCall {
  table: string
  method: string
  args: unknown[]
}

function createFakeClient(options: {
  subscription?: unknown
  counts?: Record<string, number>
  error?: { code: string; message: string }
}) {
  const calls: RecordedCall[] = []

  const from = vi.fn((table: string) => {
    let isHeadCount = false
    const query: Record<string, unknown> = {}

    for (const method of ['select', 'eq', 'is', 'order', 'limit']) {
      query[method] = (...args: unknown[]) => {
        calls.push({ table, method, args })

        if (method === 'select') {
          const config = args[1] as { head?: boolean } | undefined
          if (config?.head) isHeadCount = true
        }

        return query
      }
    }

    query.maybeSingle = () =>
      Promise.resolve(
        options.error
          ? { data: null, error: options.error }
          : { data: options.subscription ?? null, error: null },
      )

    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve(
        isHeadCount
          ? { data: null, count: options.counts?.[table] ?? 0, error: null }
          : { data: [], count: null, error: null },
      ).then(onFulfilled, onRejected)

    return query
  })

  return {
    calls,
    client: { from } as never,
    ofTable: (table: string) => calls.filter((call) => call.table === table),
  }
}

function subscriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    status: 'active',
    trial_ends_at: null,
    current_period_start: '2026-08-01T00:00:00.000Z',
    current_period_end: '2026-09-01T00:00:00.000Z',
    canceled_at: null,
    provider: null,
    plans: {
      id: 'plan-1',
      name: 'Clínica Plus',
      price_cents: 24_900,
      currency: 'BRL',
      max_professionals: 10,
      max_patients: 1_000,
      storage_mb: 5_000,
    },
    ...overrides,
  }
}

describe('leitura da assinatura', () => {
  it('devolve plano e cotas da clínica', async () => {
    const fake = createFakeClient({
      subscription: subscriptionRow(),
      counts: { professionals: 4, patients: 320 },
    })

    const overview = await new SupabaseSubscriptionRepository(
      fake.client,
    ).overview(CLINIC)

    expect(overview.subscription?.plan.name).toBe('Clínica Plus')
    expect(overview.subscription?.plan.maxProfessionals).toBe(10)
    expect(overview.usage).toEqual({ professionals: 4, patients: 320 })
  })

  it('clínica sem assinatura não é erro — o uso continua contado', async () => {
    const fake = createFakeClient({
      subscription: null,
      counts: { professionals: 2, patients: 15 },
    })

    const overview = await new SupabaseSubscriptionRepository(
      fake.client,
    ).overview(CLINIC)

    expect(overview.subscription).toBeNull()
    expect(overview.usage).toEqual({ professionals: 2, patients: 15 })
  })

  it('assinatura sem plano é linha órfã, e vira ausência', async () => {
    const fake = createFakeClient({
      subscription: subscriptionRow({ plans: null }),
    })

    const overview = await new SupabaseSubscriptionRepository(
      fake.client,
    ).overview(CLINIC)

    expect(overview.subscription).toBeNull()
  })

  it('pega a assinatura mais recente — clínica que trocou de plano tem duas', async () => {
    const fake = createFakeClient({ subscription: subscriptionRow() })

    await new SupabaseSubscriptionRepository(fake.client).overview(CLINIC)

    const subs = fake.ofTable('subscriptions')
    expect(
      subs.some(
        (call) =>
          call.method === 'order' &&
          call.args[0] === 'created_at' &&
          (call.args[1] as { ascending?: boolean }).ascending === false,
      ),
    ).toBe(true)
    expect(subs.some((call) => call.method === 'limit' && call.args[0] === 1)).toBe(
      true,
    )
  })
})

describe('tenant', () => {
  it('filtra a clínica na assinatura e nas duas contagens', async () => {
    const fake = createFakeClient({ subscription: subscriptionRow() })

    await new SupabaseSubscriptionRepository(fake.client).overview(CLINIC)

    for (const table of ['subscriptions', 'professionals', 'patients']) {
      const temTenant = fake
        .ofTable(table)
        .some(
          (call) =>
            call.method === 'eq' &&
            call.args[0] === 'clinic_id' &&
            call.args[1] === CLINIC,
        )
      expect(temTenant, table).toBe(true)
    }
  })

  it('não consulta `plans` diretamente — catálogo global viria inteiro', async () => {
    const fake = createFakeClient({ subscription: subscriptionRow() })

    await new SupabaseSubscriptionRepository(fake.client).overview(CLINIC)

    expect(fake.ofTable('plans')).toHaveLength(0)
  })
})

describe('o que a cota conta', () => {
  it('só profissional ativo — inativo não consome plano', async () => {
    const fake = createFakeClient({ subscription: subscriptionRow() })

    await new SupabaseSubscriptionRepository(fake.client).overview(CLINIC)

    expect(
      fake
        .ofTable('professionals')
        .some(
          (call) =>
            call.method === 'eq' &&
            call.args[0] === 'is_active' &&
            call.args[1] === true,
        ),
    ).toBe(true)
  })

  it.each([['professionals'], ['patients']])(
    'ignora removido em %s',
    async (table) => {
      const fake = createFakeClient({ subscription: subscriptionRow() })

      await new SupabaseSubscriptionRepository(fake.client).overview(CLINIC)

      expect(
        fake
          .ofTable(table)
          .some((call) => call.method === 'is' && call.args[0] === 'deleted_at'),
      ).toBe(true)
    },
  )

  it('conta sem transferir linha', async () => {
    const fake = createFakeClient({ subscription: subscriptionRow() })

    await new SupabaseSubscriptionRepository(fake.client).overview(CLINIC)

    for (const table of ['professionals', 'patients']) {
      const select = fake
        .ofTable(table)
        .find((call) => call.method === 'select')
      expect(
        (select?.args[1] as { head?: boolean } | undefined)?.head,
        table,
      ).toBe(true)
    }
  })
})

describe('falha do banco', () => {
  it('não deixa detalhe do Postgres chegar à tela', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({
      error: { code: '42501', message: 'permission denied for table subscriptions' },
    })

    await expect(
      new SupabaseSubscriptionRepository(fake.client).overview(CLINIC),
    ).rejects.toThrow(/não foi possível carregar a assinatura/i)

    expect(JSON.stringify(spy.mock.calls)).not.toContain('permission denied')
    spy.mockRestore()
  })
})
