import { describe, expect, it, vi } from 'vitest'

import { SupabasePriceListRepository } from './SupabasePriceListRepository'

/**
 * Contrato das tabelas de preço.
 *
 * Sem banco e sem rede — o cliente é um duplo. `price_lists` e
 * `price_list_items` já existem no schema aplicado.
 *
 * O que se prova: escopo de tenant, a ordem das duas escritas do padrão, e que
 * **o repasse ao profissional nunca é lido nem gravado**.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const OTHER_CLINIC = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'
const LIST = '11111111-1111-4111-8111-111111111111'
const SERVICE = '22222222-2222-4222-8222-222222222222'
const ITEM = '33333333-3333-4333-8333-333333333333'

interface RecordedCall {
  table: string
  method: string
  args: unknown[]
}

function listRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LIST,
    name: 'Convênio Aurora',
    is_default: false,
    valid_from: null,
    valid_until: null,
    is_active: true,
    price_list_items: [
      {
        id: ITEM,
        service_id: SERVICE,
        price_cents: 18_000,
        services: { id: SERVICE, name: 'Consulta clínica', code: 'CONS01' },
      },
    ],
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

    for (const method of ['select', 'eq', 'order', 'limit', 'insert', 'update', 'delete']) {
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
    subject: new SupabasePriceListRepository({ from } as never),
  }
}

/**
 * `professional_share_percent` e `professional_share_cents` expressam a mesma
 * coisa e nada declara qual vence. Escolher seria adivinhar um número que vira
 * dinheiro no bolso de alguém.
 */
describe('o repasse ao profissional fica fora', () => {
  it('não é lido', () => {
    const { subject, argsOf } = repository({ rows: [listRow()] })

    void subject.list(CLINIC)

    const columns = argsOf('select')[0][0] as string
    expect(columns).not.toContain('professional_share')
    expect(columns).toContain('price_cents')
  })

  it('não é gravado ao precificar', async () => {
    const { subject, argsOf } = repository({ singles: [null, listRow()] })

    await subject.setItemPrice(CLINIC, LIST, SERVICE, 18_000)

    const payload = argsOf('insert')[0][0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('professional_share_percent')
    expect(payload).not.toHaveProperty('professional_share_cents')
    expect(payload.price_cents).toBe(18_000)
  })
})

describe('leitura', () => {
  it('filtra pela clínica recebida', async () => {
    const { subject, argsOf } = repository({ rows: [listRow()] })

    await subject.list(OTHER_CLINIC)

    expect(argsOf('eq')).toContainEqual(['clinic_id', OTHER_CLINIC])
  })

  it('resolve o nome do serviço no item', async () => {
    const { subject } = repository({ rows: [listRow()] })

    const [list] = await subject.list(CLINIC)

    expect(list.items[0]).toMatchObject({
      serviceName: 'Consulta clínica',
      serviceCode: 'CONS01',
      priceCents: 18_000,
    })
  })

  it('serviço apagado do catálogo não vira item órfão sem nome', async () => {
    /*
     * O item continua existindo; esconder o nome deixaria um preço que ninguém
     * consegue interpretar.
     */
    const { subject } = repository({
      rows: [
        listRow({
          price_list_items: [
            { id: ITEM, service_id: SERVICE, price_cents: 18_000, services: null },
          ],
        }),
      ],
    })

    const [list] = await subject.list(CLINIC)

    expect(list.items[0].serviceName).toBe('Serviço removido do catálogo')
  })
})

describe('criação', () => {
  it('a tabela nasce ativa e SEM ser padrão', async () => {
    /*
     * Promover automaticamente faria a primeira tabela criada virar a
     * referência de preço da clínica sem ninguém decidir isso.
     */
    const { subject, argsOf } = repository({ singles: [{ id: LIST }, listRow()] })

    await subject.create(CLINIC, { name: 'Convênio Aurora', validFrom: null, validUntil: null })

    expect(argsOf('insert')[0][0]).toMatchObject({
      clinic_id: CLINIC,
      is_active: true,
      is_default: false,
    })
  })

  it('a validade vai como data, sem hora', async () => {
    // As colunas são `date`; mandar ISO completo dependeria do fuso do servidor.
    const { subject, argsOf } = repository({ singles: [{ id: LIST }, listRow()] })

    await subject.create(CLINIC, {
      name: 'X',
      validFrom: new Date(2026, 7, 10),
      validUntil: null,
    })

    expect((argsOf('insert')[0][0] as Record<string, unknown>).valid_from).toBe('2026-08-10')
  })
})

/**
 * Não há função no banco para as duas escritas juntas, e esta fatia não cria
 * migration. A ORDEM é a proteção.
 */
describe('tornar padrão', () => {
  it('limpa o padrão anterior ANTES de promover', async () => {
    /*
     * A ordem inversa deixaria duas tabelas padrão, e aí ninguém sabe qual
     * preço vale. Assim, uma falha na segunda escrita deixa a clínica SEM
     * padrão — estado visível, que pede uma escolha.
     */
    const { subject, calls } = repository({ singles: [{ id: LIST }, listRow({ is_default: true })] })

    await subject.setDefault(CLINIC, LIST)

    const updates = calls.filter((call) => call.method === 'update')
    expect(updates[0].args[0]).toMatchObject({ is_default: false })
    expect(updates[1].args[0]).toMatchObject({ is_default: true })
  })

  it('a limpeza é escopada na clínica', async () => {
    const { subject, calls } = repository({ singles: [{ id: LIST }, listRow()] })

    await subject.setDefault(CLINIC, LIST)

    const eqs = calls.filter((call) => call.method === 'eq').map((call) => call.args)
    expect(eqs).toContainEqual(['clinic_id', CLINIC])
    expect(eqs).toContainEqual(['is_default', true])
  })
})

describe('preço do item', () => {
  it('atualiza o item existente em vez de criar um segundo', async () => {
    /*
     * O serviço não pode aparecer duas vezes na mesma tabela: quem fatura não
     * saberia qual valor cobrar.
     */
    const { subject, calls, argsOf } = repository({ singles: [{ id: ITEM }, listRow()] })

    await subject.setItemPrice(CLINIC, LIST, SERVICE, 20_000)

    expect(calls.some((call) => call.method === 'insert')).toBe(false)
    expect(argsOf('update')[0][0]).toMatchObject({ price_cents: 20_000 })
  })

  it('remover apaga de verdade — item de tabela é configuração', async () => {
    /*
     * O que foi cobrado vive em `invoice_items`, com o valor copiado no momento
     * da cobrança. Guardar o item removido não protegeria nada.
     */
    const { subject, calls } = repository({ singles: [listRow()] })

    await subject.removeItem(CLINIC, LIST, ITEM)

    expect(calls.some((call) => call.method === 'delete')).toBe(true)
  })
})

describe('tradução das recusas do banco', () => {
  it('zero linhas com a tabela ainda legível é recusa de escrita', async () => {
    const { subject } = repository({ singles: [null, { id: LIST }] })

    await expect(subject.setActive(CLINIC, LIST, false)).rejects.toMatchObject({
      reason: 'write-forbidden',
    })
  })

  it('zero linhas com a tabela ausente é not-found', async () => {
    const { subject } = repository({ singles: [null, null] })

    await expect(subject.setActive(CLINIC, LIST, false)).rejects.toMatchObject({
      reason: 'not-found',
    })
  })

  it('recusa da policy é forbidden', async () => {
    const { subject } = repository({ error: { code: '42501' } })

    await expect(subject.list(CLINIC)).rejects.toMatchObject({ reason: 'forbidden' })
  })

  it('índice único vira duplicidade', async () => {
    const { subject } = repository({ error: { code: '23505' } })

    await expect(subject.list(CLINIC)).rejects.toMatchObject({ reason: 'duplicate' })
  })

  it('queda de rede é retentável', async () => {
    const { subject } = repository({ error: { message: 'fetch failed' } })

    await expect(subject.list(CLINIC)).rejects.toMatchObject({ reason: 'unavailable' })
  })
})
