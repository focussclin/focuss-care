import { describe, expect, it, vi } from 'vitest'

import { SupabaseServiceRepository } from './SupabaseServiceRepository'

/**
 * Contrato do catálogo.
 *
 * Sem banco e sem rede — o cliente é um duplo. `services` já existe no schema
 * aplicado; o que se prova é o escopo de tenant, a exclusão LÓGICA e a
 * distinção entre "o serviço sumiu" e "a policy recusou a escrita".
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const OTHER_CLINIC = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'
const SERVICE = '11111111-1111-4111-8111-111111111111'

interface RecordedCall {
  table: string
  method: string
  args: unknown[]
}

function serviceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SERVICE,
    clinic_id: CLINIC,
    code: 'CONS01',
    tuss_code: '10101012',
    name: 'Consulta clínica',
    description: null,
    category: 'Consultas',
    default_duration_minutes: 30,
    default_price_cents: 25_000,
    requires_authorization: false,
    is_active: true,
    updated_at: '2026-08-10T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

interface FakeOptions {
  rows?: unknown[]
  singles?: unknown[]
  error?: { code?: string | null; message?: string | null }
}

function repository(options: FakeOptions = {}) {
  const calls: RecordedCall[] = []
  const singles = [...(options.singles ?? [])]

  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {}

    const chain = (method: string) => (...args: unknown[]) => {
      calls.push({ table, method, args })
      return builder
    }

    for (const method of ['select', 'eq', 'is', 'order', 'limit', 'insert', 'update']) {
      builder[method] = chain(method)
    }

    const single = async () => ({
      data: options.error ? null : (singles.shift() ?? null),
      error: options.error ?? null,
    })

    builder.single = async () => {
      calls.push({ table, method: 'single', args: [] })
      return single()
    }
    builder.maybeSingle = async () => {
      calls.push({ table, method: 'maybeSingle', args: [] })
      return single()
    }
    builder.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({
        data: options.error ? null : (options.rows ?? []),
        error: options.error ?? null,
      }).then(onFulfilled, onRejected)

    return builder
  })

  return {
    calls,
    argsOf: (method: string) => calls.filter((call) => call.method === method).map((call) => call.args),
    subject: new SupabaseServiceRepository({ from } as never),
  }
}

describe('leitura', () => {
  it('filtra pela clínica recebida', async () => {
    const { subject, argsOf } = repository({ rows: [serviceRow()] })

    await subject.list(OTHER_CLINIC)

    expect(argsOf('eq')).toContainEqual(['clinic_id', OTHER_CLINIC])
  })

  it('exclui o que foi apagado logicamente', async () => {
    /*
     * A linha continua no banco porque `invoice_items.service_id` pode apontar
     * para ela — apagar de verdade deixaria faturas antigas sem saber o que foi
     * cobrado —, mas ela não volta para quem monta cobrança nova.
     */
    const { subject, argsOf } = repository({ rows: [serviceRow()] })

    await subject.list(CLINIC)

    expect(argsOf('is')).toContainEqual(['deleted_at', null])
  })

  it('mapeia a linha para o domínio', async () => {
    const { subject } = repository({ rows: [serviceRow()] })

    const [service] = await subject.list(CLINIC)

    expect(service).toMatchObject({
      id: SERVICE,
      code: 'CONS01',
      tussCode: '10101012',
      defaultDurationMinutes: 30,
      defaultPriceCents: 25_000,
      requiresAuthorization: false,
      isActive: true,
    })
  })
})

describe('escrita', () => {
  it('o serviço nasce ativo e na clínica da sessão', async () => {
    const { subject, argsOf } = repository({ singles: [serviceRow()] })

    await subject.create(CLINIC, {
      code: 'CONS01',
      tussCode: null,
      name: 'Consulta clínica',
      description: null,
      category: null,
      defaultDurationMinutes: 30,
      defaultPriceCents: 25_000,
      requiresAuthorization: false,
    })

    expect(argsOf('insert')[0][0]).toMatchObject({ clinic_id: CLINIC, is_active: true })
  })

  it('desativar só mexe em `is_active` e no carimbo', async () => {
    const { subject, argsOf } = repository({ singles: [serviceRow({ is_active: false })] })

    await subject.setActive(CLINIC, SERVICE, false)

    expect(Object.keys(argsOf('update')[0][0] as object).sort()).toEqual([
      'is_active',
      'updated_at',
    ])
  })

  it('excluir é LÓGICO: grava `deleted_at`, e desativa junto', async () => {
    /*
     * A leitura já filtra `deleted_at is null`, mas qualquer consulta futura
     * que esqueça o filtro encontraria um serviço "ativo" que ninguém pode
     * escolher. Os dois campos concordando removem essa armadilha.
     */
    const { subject, argsOf } = repository({ singles: [serviceRow({ is_active: false })] })

    await subject.softDelete(CLINIC, SERVICE)

    const patch = argsOf('update')[0][0] as Record<string, unknown>
    expect(patch.deleted_at).toEqual(expect.any(String))
    expect(patch.is_active).toBe(false)
  })

  it('nenhuma escrita apaga a linha', async () => {
    // `invoice_items.service_id` pode apontar para ela.
    const { subject, calls } = repository({ singles: [serviceRow()] })

    await subject.softDelete(CLINIC, SERVICE)

    expect(calls.some((call) => call.method === 'delete')).toBe(false)
  })

  it('zero linhas com o serviço ainda legível é recusa de escrita', async () => {
    const { subject } = repository({ singles: [null, { id: SERVICE }] })

    await expect(subject.setActive(CLINIC, SERVICE, false)).rejects.toMatchObject({
      reason: 'write-forbidden',
    })
  })

  it('zero linhas com o serviço ausente é not-found', async () => {
    const { subject } = repository({ singles: [null, null] })

    await expect(subject.setActive(CLINIC, SERVICE, false)).rejects.toMatchObject({
      reason: 'not-found',
    })
  })

  it('a releitura é escopada na clínica', async () => {
    const { subject, argsOf } = repository({ singles: [null, null] })

    await subject.setActive(CLINIC, SERVICE, false).catch(() => undefined)

    expect(argsOf('eq')).toContainEqual(['clinic_id', CLINIC])
  })
})

describe('tradução das recusas do banco', () => {
  async function reasonOf(error: { code?: string | null; message?: string | null }) {
    const { subject } = repository({ error })
    return subject
      .list(CLINIC)
      .then(() => 'sem erro')
      .catch((cause: { reason: string }) => cause.reason)
  }

  it('recusa da policy é forbidden', async () => {
    expect(await reasonOf({ code: '42501' })).toBe('forbidden')
    expect(await reasonOf({ code: 'PGRST301' })).toBe('forbidden')
  })

  it('índice único vira duplicidade', async () => {
    // A aplicação checa antes para dar mensagem melhor, mas a checagem dela tem
    // janela de corrida — esta não tem.
    expect(await reasonOf({ code: '23505' })).toBe('duplicate')
  })

  it('queda de rede é retentável', async () => {
    expect(await reasonOf({ message: 'fetch failed' })).toBe('unavailable')
  })

  it('o resto é inesperado, e leva o código para o log', async () => {
    const { subject } = repository({ error: { code: '23502' } })

    await expect(subject.list(CLINIC)).rejects.toMatchObject({
      reason: 'unexpected',
      code: '23502',
    })
  })
})
