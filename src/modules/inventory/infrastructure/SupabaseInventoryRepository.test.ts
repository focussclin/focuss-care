import { describe, expect, it, vi } from 'vitest'

import { SupabaseInventoryRepository } from './SupabaseInventoryRepository'

/**
 * Contrato do estoque.
 *
 * Sem banco e sem rede — o cliente é um duplo, como em
 * `SupabaseInsuranceRepository.test.ts`. Tenancy de verdade continua sendo pgTAP
 * no banco (R1); aqui se prova que a APLICAÇÃO nunca chega a pedir a clínica
 * errada, e que cada recusa do Postgres vira o motivo certo.
 *
 * # Por que a tradução de erro ocupa metade do arquivo
 *
 * Estoque é o primeiro módulo do produto em que o banco recusa por REGRA DE
 * NEGÓCIO, e não só por permissão: `record_inventory_movement` levanta
 * `insufficient_stock` quando a saída é maior que o saldo. Confundir isso com
 * "falha inesperada" faria a tela mandar tentar de novo uma operação que vai
 * falhar sempre — e a recepção repetiria até desistir, sem nunca saber que o
 * problema era o saldo.
 *
 * A mesma distinção separa `schema-not-ready` (a migration ainda não foi
 * aplicada — não adianta tentar) de `unavailable` (o serviço caiu — vale tentar
 * de novo).
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const OTHER_CLINIC = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const ITEM = '9019956f-bdd8-4d61-868d-09b02332dad0'
const MOVEMENT = '11111111-1111-4111-8111-111111111111'

interface RecordedCall {
  query: number
  table: string
  method: string
  args: unknown[]
}

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM,
    clinic_id: CLINIC,
    name: 'Luva de procedimento M',
    sku: 'LUV-M',
    unit: 'caixa',
    minimum_quantity: 5,
    current_quantity: 12,
    notes: null,
    is_active: true,
    created_by: USER,
    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-09T10:00:00.000Z',
    ...overrides,
  }
}

function movementRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MOVEMENT,
    clinic_id: CLINIC,
    item_id: ITEM,
    movement_type: 'out',
    quantity: 2,
    unit_cost_cents: 1590,
    counted_quantity: null,
    reason: 'Uso no atendimento',
    created_by: USER,
    created_at: '2026-08-09T11:00:00.000Z',
    ...overrides,
  }
}

interface FakeOptions {
  /** Linhas devolvidas por uma leitura de lista, por tabela. */
  rows?: (table: string) => unknown[]
  /** Linha devolvida por `single()`/`maybeSingle()`. */
  row?: unknown
  /** Resposta da RPC. */
  rpcRow?: unknown
  /** Erro devolvido por qualquer caminho — é assim que se testa a tradução. */
  error?: { code?: string | null; message?: string | null }
}

function createFakeClient(options: FakeOptions = {}) {
  const calls: RecordedCall[] = []
  let queryIndex = -1

  const from = vi.fn((table: string) => {
    queryIndex += 1
    const index = queryIndex
    const query: Record<string, unknown> = {}

    for (const method of [
      'select',
      'eq',
      'order',
      'limit',
      'insert',
      'update',
    ]) {
      query[method] = (...args: unknown[]) => {
        calls.push({ query: index, table, method, args })
        return query
      }
    }

    const singleResult = () => ({
      data: options.error ? null : 'row' in options ? options.row : itemRow(),
      error: options.error ?? null,
    })

    query.single = async () => {
      calls.push({ query: index, table, method: 'single', args: [] })
      return singleResult()
    }

    query.maybeSingle = async () => {
      calls.push({ query: index, table, method: 'maybeSingle', args: [] })
      return singleResult()
    }

    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({
        data: options.error ? null : (options.rows?.(table) ?? []),
        error: options.error ?? null,
      }).then(onFulfilled, onRejected)

    return query
  })

  const rpc = vi.fn(async (fn: string, args: unknown) => {
    calls.push({ query: -1, table: `rpc:${fn}`, method: 'rpc', args: [args] })
    return {
      data: options.error ? null : 'rpcRow' in options ? options.rpcRow : movementRow(),
      error: options.error ?? null,
    }
  })

  return {
    calls,
    rpc,
    client: { from, rpc } as never,
    ofTable: (table: string) => calls.filter((call) => call.table === table),
    /** Um filtro `eq` específico foi aplicado em alguma consulta? */
    hasEq: (field: string, value: unknown) =>
      calls.some(
        (call) =>
          call.method === 'eq' &&
          call.args[0] === field &&
          call.args[1] === value,
      ),
  }
}

function repository(options: FakeOptions = {}) {
  const fake = createFakeClient(options)
  return { fake, subject: new SupabaseInventoryRepository(fake.client) }
}

// ---------------------------------------------------------------------------

describe('listItems', () => {
  it('mapeia a linha do banco para a entidade', async () => {
    const { subject } = repository({ rows: () => [itemRow()] })

    const items = await subject.listItems(CLINIC)

    expect(items).toEqual([
      {
        id: ITEM,
        name: 'Luva de procedimento M',
        sku: 'LUV-M',
        unit: 'caixa',
        minimumQuantity: 5,
        currentQuantity: 12,
        notes: null,
        isActive: true,
        updatedAt: new Date('2026-08-09T10:00:00.000Z'),
      },
    ])
  })

  it('filtra a clínica da sessão — a RLS é a última linha, não a única', async () => {
    const { fake, subject } = repository({ rows: () => [] })

    await subject.listItems(CLINIC)

    expect(fake.hasEq('clinic_id', CLINIC)).toBe(true)
    expect(JSON.stringify(fake.calls)).not.toContain(OTHER_CLINIC)
  })

  it('ordena por nome — a lista é lida, não paginada', async () => {
    const { fake, subject } = repository({ rows: () => [] })

    await subject.listItems(CLINIC)

    const order = fake
      .ofTable('inventory_items')
      .find((call) => call.method === 'order')

    expect(order?.args[0]).toBe('name')
    expect((order?.args[1] as { ascending: boolean }).ascending).toBe(true)
  })

  it('tem teto de leitura, para a tela não virar relatório', async () => {
    const { fake, subject } = repository({ rows: () => [] })

    await subject.listItems(CLINIC)

    const limit = fake
      .ofTable('inventory_items')
      .find((call) => call.method === 'limit')

    expect(limit?.args[0]).toBe(200)
  })

  it('clínica sem item devolve lista vazia, e não erro', async () => {
    const { subject } = repository({ rows: () => [] })

    await expect(subject.listItems(CLINIC)).resolves.toEqual([])
  })
})

describe('listRecentMovements', () => {
  it('mapeia a movimentação, com o custo em centavos', async () => {
    const { subject } = repository({ rows: () => [movementRow()] })

    const movements = await subject.listRecentMovements(CLINIC)

    expect(movements).toEqual([
      {
        id: MOVEMENT,
        itemId: ITEM,
        movementType: 'out',
        quantity: 2,
        unitCostCents: 1590,
        // Nulo aqui é o que diz que a saída veio da operação, e não de uma
        // contagem de inventário.
        countedQuantity: null,
        reason: 'Uso no atendimento',
        createdAt: new Date('2026-08-09T11:00:00.000Z'),
      },
    ])
  })

  it('filtra a clínica', async () => {
    const { fake, subject } = repository({ rows: () => [] })

    await subject.listRecentMovements(CLINIC)

    expect(fake.hasEq('clinic_id', CLINIC)).toBe(true)
  })

  it('traz o mais recente primeiro — "recentes" é a pergunta da tela', async () => {
    const { fake, subject } = repository({ rows: () => [] })

    await subject.listRecentMovements(CLINIC)

    const order = fake
      .ofTable('inventory_movements')
      .find((call) => call.method === 'order')

    expect(order?.args[0]).toBe('created_at')
    expect((order?.args[1] as { ascending: boolean }).ascending).toBe(false)
  })

  it('limita a 100 — histórico completo é outra tela', async () => {
    const { fake, subject } = repository({ rows: () => [] })

    await subject.listRecentMovements(CLINIC)

    const limit = fake
      .ofTable('inventory_movements')
      .find((call) => call.method === 'limit')

    expect(limit?.args[0]).toBe(100)
  })
})

describe('createItem', () => {
  it('grava a clínica da sessão e o autor, e devolve a entidade', async () => {
    const { fake, subject } = repository({ row: itemRow() })

    const item = await subject.createItem(CLINIC, USER, {
      name: 'Luva de procedimento M',
      sku: 'LUV-M',
      unit: 'caixa',
      minimumQuantity: 5,
      notes: null,
    })

    const insert = fake
      .ofTable('inventory_items')
      .find((call) => call.method === 'insert')

    expect(insert?.args[0]).toMatchObject({
      clinic_id: CLINIC,
      created_by: USER,
      name: 'Luva de procedimento M',
      minimum_quantity: 5,
    })
    expect(item.id).toBe(ITEM)
  })

  it('não deixa a clínica vir de fora do contexto', async () => {
    const { fake, subject } = repository({ row: itemRow() })

    await subject.createItem(CLINIC, USER, {
      name: 'Seringa 5ml',
      sku: null,
      unit: 'unidade',
      minimumQuantity: 0,
      notes: null,
    })

    const insert = fake
      .ofTable('inventory_items')
      .find((call) => call.method === 'insert')

    expect((insert?.args[0] as { clinic_id: string }).clinic_id).toBe(CLINIC)
    expect(JSON.stringify(insert?.args[0])).not.toContain(OTHER_CLINIC)
  })

  it('saldo inicial NÃO é escrito na criação', async () => {
    /*
     * `current_quantity` só se move por `record_inventory_movement`, que grava a
     * movimentação junto. Deixar o item nascer com saldo pelo insert criaria
     * estoque sem lastro — um número que ninguém consegue explicar depois.
     */
    const { fake, subject } = repository({ row: itemRow() })

    await subject.createItem(CLINIC, USER, {
      name: 'Gaze',
      sku: null,
      unit: 'pacote',
      minimumQuantity: 1,
      notes: null,
    })

    const insert = fake
      .ofTable('inventory_items')
      .find((call) => call.method === 'insert')

    expect(insert?.args[0]).not.toHaveProperty('current_quantity')
  })
})

describe('updateItem', () => {
  it('prende clínica E item — id sozinho alcançaria outra clínica', async () => {
    const { fake, subject } = repository({ row: itemRow() })

    await subject.updateItem(CLINIC, ITEM, { name: 'Luva M' })

    expect(fake.hasEq('clinic_id', CLINIC)).toBe(true)
    expect(fake.hasEq('id', ITEM)).toBe(true)
  })

  it('envia só o que mudou, e sempre carimba `updated_at`', async () => {
    const { fake, subject } = repository({ row: itemRow() })

    await subject.updateItem(CLINIC, ITEM, { minimumQuantity: 10 })

    const patch = fake
      .ofTable('inventory_items')
      .find((call) => call.method === 'update')?.args[0] as Record<
      string,
      unknown
    >

    expect(patch).toHaveProperty('minimum_quantity', 10)
    expect(patch).toHaveProperty('updated_at')
    expect(patch).not.toHaveProperty('name')
    expect(patch).not.toHaveProperty('sku')
  })

  it('distingue "não mandou o campo" de "mandou nulo"', async () => {
    // `notes: null` é apagar a observação; `notes` ausente é não tocar nela.
    const { fake, subject } = repository({ row: itemRow() })

    await subject.updateItem(CLINIC, ITEM, { notes: null })

    const patch = fake
      .ofTable('inventory_items')
      .find((call) => call.method === 'update')?.args[0] as Record<
      string,
      unknown
    >

    expect(patch).toHaveProperty('notes', null)
  })

  it('item de outra clínica vira not-found, e não erro genérico', async () => {
    // A consulta filtra a clínica, então a linha simplesmente não aparece.
    const { subject } = repository({ row: null })

    await expect(subject.updateItem(CLINIC, ITEM, { name: 'x' })).rejects.toMatchObject(
      { reason: 'not-found' },
    )
  })
})

describe('setItemActive', () => {
  it('desativar é um update de `is_active`, não um delete', async () => {
    /*
     * Item desativado continua referenciado pelas movimentações passadas.
     * Apagar a linha quebraria o histórico de consumo.
     */
    const { fake, subject } = repository({ row: itemRow({ is_active: false }) })

    const item = await subject.setItemActive(CLINIC, ITEM, false)

    const patch = fake
      .ofTable('inventory_items')
      .find((call) => call.method === 'update')?.args[0] as Record<
      string,
      unknown
    >

    expect(patch).toHaveProperty('is_active', false)
    expect(item.isActive).toBe(false)
    expect(
      fake.calls.some((call) => call.method === 'delete'),
    ).toBe(false)
  })

  it('reativar usa o mesmo caminho, com o sinal trocado', async () => {
    const { fake, subject } = repository({ row: itemRow({ is_active: true }) })

    await subject.setItemActive(CLINIC, ITEM, true)

    const patch = fake
      .ofTable('inventory_items')
      .find((call) => call.method === 'update')?.args[0] as Record<
      string,
      unknown
    >

    expect(patch).toHaveProperty('is_active', true)
    expect(fake.hasEq('clinic_id', CLINIC)).toBe(true)
  })
})

describe('recordMovement', () => {
  it('chama a RPC com a clínica, e o autor NÃO vai junto', async () => {
    const { fake, subject } = repository({ rpcRow: movementRow() })

    await subject.recordMovement(CLINIC, {
      itemId: ITEM,
      movementType: 'out',
      quantity: 2,
      unitCostCents: 1590,
      reason: 'Uso no atendimento',
    })

    expect(fake.rpc).toHaveBeenCalledTimes(1)
    const [fn, args] = fake.rpc.mock.calls[0]

    expect(fn).toBe('record_inventory_movement')

    /*
     * `toEqual` exato, e não `objectContaining`: a ausência do autor é o ponto.
     *
     * Até 10/08/2026 ia um `p_created_by` daqui. A aplicação sempre mandava o
     * `context.userId` certo — mas a RPC tem `grant execute` a `authenticated`,
     * e quem chamasse pelo PostgREST direto escolhia o autor. Uma saída de
     * estoque ficava registrada em nome de outra pessoa, e a trilha de
     * auditoria mentia sem nunca ter sido violada.
     *
     * Agora a função resolve com `auth.uid()`. Se alguém reintroduzir o
     * argumento, esta linha falha — e é o que se quer, porque o parâmetro de
     * volta significa a função de volta a confiar no chamador.
     */
    expect(args).toEqual({
      p_clinic_id: CLINIC,
      p_item_id: ITEM,
      p_movement_type: 'out',
      p_quantity: 2,
      p_unit_cost_cents: 1590,
      p_reason: 'Uso no atendimento',
    })
  })

  it('é RPC, e não insert — saldo e movimentação mudam juntos', async () => {
    /*
     * Gravar a movimentação e somar o saldo em duas idas ao banco deixaria uma
     * janela em que o histórico não bate com o número exibido. Quem fecha isso é
     * a função no banco, numa transação só.
     */
    const { fake, subject } = repository({ rpcRow: movementRow() })

    await subject.recordMovement(CLINIC, {
      itemId: ITEM,
      movementType: 'in',
      quantity: 10,
      unitCostCents: null,
      reason: null,
    })

    expect(fake.ofTable('inventory_movements')).toHaveLength(0)
    expect(
      fake.calls.some((call) => call.method === 'insert'),
    ).toBe(false)
  })

  it('mapeia a movimentação devolvida pela RPC', async () => {
    const { subject } = repository({ rpcRow: movementRow({ quantity: 7 }) })

    const movement = await subject.recordMovement(CLINIC, {
      itemId: ITEM,
      movementType: 'out',
      quantity: 7,
      unitCostCents: null,
      reason: null,
    })

    expect(movement.quantity).toBe(7)
    expect(movement.createdAt).toBeInstanceOf(Date)
  })

  it('RPC sem retorno vira not-found', async () => {
    const { subject } = repository({ rpcRow: null })

    await expect(
      subject.recordMovement(CLINIC, {
        itemId: ITEM,
        movementType: 'out',
        quantity: 1,
        unitCostCents: null,
        reason: null,
      }),
    ).rejects.toMatchObject({ reason: 'not-found' })
  })
})

/**
 * Ajuste por contagem.
 *
 * O que a aplicação manda é o SALDO CONTADO. A diferença é calculada em
 * `set_inventory_quantity`, depois do `for update` — se fosse calculada aqui,
 * seria preciso ler o saldo antes, e duas contagens simultâneas partiriam do
 * mesmo número velho.
 */
describe('setQuantity', () => {
  it('manda o valor contado, sem calcular diferença nem ler o saldo antes', async () => {
    const { fake, subject } = repository({ rpcRow: movementRow({ counted_quantity: 30 }) })

    await subject.setQuantity(CLINIC, {
      itemId: ITEM,
      countedQuantity: 30,
      reason: 'Contagem mensal',
    })

    const chamadas = fake.calls
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].table).toBe('rpc:set_inventory_quantity')
    expect(chamadas[0].args[0]).toEqual({
      p_clinic_id: CLINIC,
      p_item_id: ITEM,
      p_counted_quantity: 30,
      p_reason: 'Contagem mensal',
    })
  })

  it('nunca manda a clínica que veio por parâmetro de outro tenant', async () => {
    const { fake, subject } = repository({ rpcRow: movementRow() })

    await subject.setQuantity(OTHER_CLINIC, { itemId: ITEM, countedQuantity: 1, reason: null })

    expect(fake.calls[0].args[0]).toMatchObject({ p_clinic_id: OTHER_CLINIC })
  })

  it('devolve o saldo apurado junto do movimento', async () => {
    const { subject } = repository({ rpcRow: movementRow({ movement_type: 'in', quantity: 18, counted_quantity: 30 }) })

    const movement = await subject.setQuantity(CLINIC, { itemId: ITEM, countedQuantity: 30, reason: null })

    expect(movement).toMatchObject({ movementType: 'in', quantity: 18, countedQuantity: 30 })
  })

  it('retorno nulo é contagem que confere — NÃO é item ausente', async () => {
    /*
     * A diferença com `recordMovement`, que trata nulo como `not-found`. Aqui a
     * função devolve nulo de propósito quando a contagem bate com o saldo, e
     * traduzir isso para erro faria a tela acusar falha numa conferência que
     * deu certo.
     */
    const { subject } = repository({ rpcRow: null })

    await expect(
      subject.setQuantity(CLINIC, { itemId: ITEM, countedQuantity: 12, reason: null }),
    ).resolves.toBeNull()
  })

  it('recusa do banco continua virando o motivo certo', async () => {
    const { subject } = repository({ error: { code: 'P0002' } })

    await expect(
      subject.setQuantity(CLINIC, { itemId: ITEM, countedQuantity: 3, reason: null }),
    ).rejects.toMatchObject({ reason: 'not-found' })
  })
})

describe('tradução das recusas do banco', () => {
  async function reasonOf(error: {
    code?: string | null
    message?: string | null
  }) {
    const { subject } = repository({ error })

    return subject
      .listItems(CLINIC)
      .then(() => 'sem erro')
      .catch((cause: { reason: string }) => cause.reason)
  }

  it.each([
    ['relação inexistente', { code: '42P01' }, 'schema-not-ready'],
    ['tabela fora do cache do PostgREST', { code: 'PGRST205' }, 'schema-not-ready'],
    ['policy recusou', { code: '42501' }, 'forbidden'],
    ['sku duplicado', { code: '23505' }, 'duplicate'],
    ['saldo insuficiente', { code: 'P0001' }, 'insufficient-stock'],
    ['movimentação inválida', { code: '22023' }, 'invalid-movement'],
    ['alvo inexistente', { code: 'P0002' }, 'not-found'],
    ['serviço fora', { code: 'PGRST301' }, 'unavailable'],
    ['código desconhecido', { code: '99999' }, 'unexpected'],
  ])('%s -> %s', async (_label, error, expected) => {
    expect(await reasonOf(error)).toBe(expected)
  })

  it.each([
    ['insufficient_stock', 'insufficient-stock'],
    ['invalid_movement', 'invalid-movement'],
    ['clinic_scope', 'forbidden'],
  ])('reconhece "%s" pela mensagem, sem código', async (message, expected) => {
    /*
     * A RPC levanta com `errcode` próprio, mas o PostgREST nem sempre o
     * repassa. Sem a leitura da mensagem, uma saída maior que o saldo viraria
     * "falha inesperada" — e a tela mandaria tentar de novo para sempre.
     */
    expect(await reasonOf({ message })).toBe(expected)
  })

  it('"não aplicada" é diferente de "fora do ar"', async () => {
    /*
     * A distinção decide o que a tela diz. `schema-not-ready` significa aplicar
     * a migration; `unavailable` significa tentar de novo. Trocá-las manda a
     * recepção repetir uma operação que nunca vai funcionar.
     */
    expect(await reasonOf({ code: '42P01' })).toBe('schema-not-ready')
    expect(await reasonOf({ code: 'PGRST000' })).toBe('unavailable')
  })

  it('a recusa da RPC também é traduzida', async () => {
    const { subject } = repository({ error: { message: 'insufficient_stock' } })

    await expect(
      subject.recordMovement(CLINIC, {
        itemId: ITEM,
        movementType: 'out',
        quantity: 999,
        unitCostCents: null,
        reason: null,
      }),
    ).rejects.toMatchObject({ reason: 'insufficient-stock' })
  })

  it('função ausente é migration pendente, e não falha inesperada', async () => {
    /*
     * Só `42883` e `PGRST202` denunciam a RPC que não existe. Sem eles a tela
     * mandaria "tente novamente" para sempre, em vez de dizer que falta rodar a
     * migration — e "tente novamente" numa função ausente nunca vai dar certo.
     */
    expect(await reasonOf({ code: '42883' })).toBe('schema-not-ready')
    expect(await reasonOf({ code: 'PGRST202' })).toBe('schema-not-ready')
  })

  it('o código do Postgres fica no erro, para o log — não para a tela', async () => {
    const { subject } = repository({ error: { code: '23505' } })

    await expect(subject.listItems(CLINIC)).rejects.toMatchObject({
      reason: 'duplicate',
      code: '23505',
    })
  })
})
