import { describe, expect, it, vi } from 'vitest'

import { hasQuotaFor, quotaFor } from './plan-quota'

/**
 * A leitura da cota — sem banco e sem rede.
 *
 * O que se prova aqui não é a aritmética (isso é `plan-limits.test.ts`): é o
 * comportamento nas bordas, que é onde uma cota mal escrita tranca uma clínica
 * inteira.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'

interface FakeOptions {
  /** Linha de `subscriptions` com o plano embutido. */
  plan?: Record<string, number | null> | null
  planError?: { code?: string; message?: string }
  count?: number
  countError?: { code?: string; message?: string }
}

function createFake(options: FakeOptions = {}) {
  const calls: { table: string; method: string; args: unknown[] }[] = []

  const from = vi.fn((table: string) => {
    const query: Record<string, unknown> = {}

    for (const method of ['select', 'eq', 'is', 'order', 'limit']) {
      query[method] = (...args: unknown[]) => {
        calls.push({ table, method, args })
        // `select` com `head` resolve direto, sem `maybeSingle`.
        if (method === 'select' && table !== 'subscriptions') {
          return {
            ...query,
            eq: query.eq,
            is: query.is,
            then: (onFulfilled: (value: unknown) => unknown) =>
              Promise.resolve({
                count: options.countError ? null : (options.count ?? 0),
                error: options.countError ?? null,
              }).then(onFulfilled),
          }
        }
        return query
      }
    }

    query.maybeSingle = async () => ({
      data: options.planError
        ? null
        : 'plan' in options
          ? { plans: options.plan }
          : { plans: { max_professionals: 10, max_patients: 500 } },
      error: options.planError ?? null,
    })

    query.then = (onFulfilled: (value: unknown) => unknown) =>
      Promise.resolve({
        count: options.countError ? null : (options.count ?? 0),
        error: options.countError ?? null,
      }).then(onFulfilled)

    return query
  })

  return { calls, client: { from } as never }
}

describe('leitura da cota', () => {
  it('lê o teto do plano vigente e o uso atual', async () => {
    const { client } = createFake({ count: 4 })

    const limit = await quotaFor(client, CLINIC, 'professionals')

    expect(limit).toEqual({ max: 10, used: 4 })
  })

  it('a coluna do teto muda com o recurso', async () => {
    /*
     * Mapa explícito, e não `${resource}_max`: o nome não é derivável do
     * recurso, e string montada é como se pede uma coluna que não existe.
     */
    const { client, calls } = createFake()

    await quotaFor(client, CLINIC, 'patients')

    const select = calls.find((call) => call.table === 'subscriptions')
    expect(select?.args[0]).toContain('max_patients')
  })

  it('é escopada na clínica recebida', async () => {
    const { client, calls } = createFake()

    await quotaFor(client, CLINIC, 'patients')

    expect(calls.map((call) => call.args)).toContainEqual(['clinic_id', CLINIC])
  })

  it('conta só profissional ATIVO', async () => {
    // A conta precisa bater com `/assinaturas`, senão a barra diz "8 de 10" e a
    // escrita recusa.
    const { client, calls } = createFake()

    await quotaFor(client, CLINIC, 'professionals')

    expect(calls.map((call) => call.args)).toContainEqual(['is_active', true])
  })

  it('paciente não filtra por ativo — arquivado continua ocupando cadastro', async () => {
    const { client, calls } = createFake()

    await quotaFor(client, CLINIC, 'patients')

    expect(calls.map((call) => call.args)).not.toContainEqual(['is_active', true])
    expect(calls.map((call) => call.args)).toContainEqual(['deleted_at', null])
  })
})

/**
 * As bordas. É aqui que uma cota mal escrita tranca uma clínica inteira.
 */
describe('quando NÃO há teto', () => {
  it('clínica sem assinatura passa', async () => {
    /*
     * `SubscriptionOverview` já documenta que uma clínica criada antes de
     * existir cobrança não tem linha em `subscriptions`. Tratar a ausência como
     * limite zero trancaria toda clínica que existe hoje no primeiro cadastro.
     */
    const { client } = createFake({ plan: null, count: 9_999 })

    const result = await hasQuotaFor(client, CLINIC, 'patients')

    expect(result).toEqual({ allowed: true, max: null })
  })

  it('plano com coluna nula é ilimitado', async () => {
    const { client } = createFake({
      plan: { max_professionals: null },
      count: 9_999,
    })

    await expect(hasQuotaFor(client, CLINIC, 'professionals')).resolves.toMatchObject(
      { allowed: true },
    )
  })

  it('falha ao ler o plano NÃO tranca a clínica', async () => {
    /*
     * Mesma escolha que o horário de funcionamento faz na agenda: um Postgres
     * lento não pode virar clínica que não consegue trabalhar. O sinal fica no
     * log do servidor.
     */
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = createFake({ planError: { code: '42501' }, count: 50 })

    const result = await hasQuotaFor(client, CLINIC, 'patients')

    expect(result.allowed).toBe(true)
    expect(logged).toHaveBeenCalled()
    logged.mockRestore()
  })

  it('falha ao contar o uso não inventa consumo', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = createFake({ countError: { code: '42501' } })

    const limit = await quotaFor(client, CLINIC, 'patients')

    expect(limit.used).toBe(0)
    logged.mockRestore()
  })
})

describe('quando o teto existe', () => {
  it('abaixo do limite, permite', async () => {
    const { client } = createFake({ plan: { max_patients: 500 }, count: 499 })

    await expect(hasQuotaFor(client, CLINIC, 'patients')).resolves.toEqual({
      allowed: true,
      max: 500,
    })
  })

  it('no limite, recusa — e devolve o teto para a mensagem', async () => {
    const { client } = createFake({ plan: { max_patients: 500 }, count: 500 })

    await expect(hasQuotaFor(client, CLINIC, 'patients')).resolves.toEqual({
      allowed: false,
      max: 500,
    })
  })
})
