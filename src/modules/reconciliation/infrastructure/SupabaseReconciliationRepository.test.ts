import { describe, expect, it, vi } from 'vitest'

import { SupabaseReconciliationRepository } from './SupabaseReconciliationRepository'

/**
 * Contrato da conciliação.
 *
 * Sem banco e sem rede — o cliente é um duplo, como em
 * `SupabaseInventoryRepository.test.ts`. Tenancy de verdade continua sendo
 * pgTAP (R1); aqui se prova que a APLICAÇÃO nunca pede a clínica errada e que
 * cada recusa do Postgres vira o motivo certo.
 *
 * # Por que a tradução de erro ocupa metade do arquivo
 *
 * `reconcile_bank_transaction` levanta QUATRO recusas diferentes com o mesmo
 * `22023`. Só a mensagem as separa, e separá-las decide se a pessoa consegue
 * agir: "esta transação já foi conciliada" leva a recarregar a lista, enquanto
 * "escolha uma fatura ou despesa" leva a trocar de alvo — o que, nesse caso,
 * vai falhar em todas as tentativas, porque o alvo nunca foi o problema.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const OTHER_CLINIC = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const TRANSACTION = '22222222-2222-4222-8222-222222222222'
const INVOICE = '33333333-3333-4333-8333-333333333333'
const PAYABLE = '44444444-4444-4444-8444-444444444444'

interface RecordedCall {
  table: string
  method: string
  args: unknown[]
}

function transactionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TRANSACTION,
    clinic_id: CLINIC,
    bank_account_id: ACCOUNT,
    occurred_on: '2026-08-09',
    direction: 'credit',
    amount_cents: 12500,
    description: 'Recebimento via PIX',
    external_id: 'pix-001',
    status: 'pending',
    notes: null,
    account: { id: ACCOUNT, name: 'Conta principal' },
    reconciliation: null,
    ...overrides,
  }
}

function reconciliationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    transaction_id: TRANSACTION,
    invoice_id: INVOICE,
    payable_id: null,
    matched_amount_cents: 12500,
    notes: null,
    ...overrides,
  }
}

interface FakeOptions {
  rows?: (table: string) => unknown[]
  row?: unknown
  rpcRow?: unknown
  error?: { code?: string | null; message?: string | null }
}

function repository(options: FakeOptions = {}) {
  const calls: RecordedCall[] = []

  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {}

    const chain = (method: string) => (...args: unknown[]) => {
      calls.push({ table, method, args })
      return builder
    }

    for (const method of ['select', 'eq', 'in', 'is', 'order', 'limit', 'insert', 'update']) {
      builder[method] = chain(method)
    }

    const single = async () => ({
      // `'row' in options` em vez de `??`: um `row: null` explícito precisa
      // continuar nulo, e não cair no padrão.
      data: options.error ? null : 'row' in options ? options.row : transactionRow(),
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
        data: options.error ? null : (options.rows?.(table) ?? []),
        error: options.error ?? null,
      }).then(onFulfilled, onRejected)

    return builder
  })

  const rpc = vi.fn(async (fn: string, args: unknown) => {
    calls.push({ table: `rpc:${fn}`, method: 'rpc', args: [args] })
    return {
      data: options.error ? null : 'rpcRow' in options ? options.rpcRow : reconciliationRow(),
      error: options.error ?? null,
    }
  })

  return {
    calls,
    argsOf: (method: string) => calls.filter((call) => call.method === method).map((call) => call.args),
    subject: new SupabaseReconciliationRepository({ from, rpc } as never),
  }
}

describe('leitura de transações', () => {
  it('filtra pela clínica e monta o vínculo já carregado', async () => {
    const { subject, calls } = repository({
      rows: () => [transactionRow({ status: 'reconciled', reconciliation: reconciliationRow() })],
    })

    const transactions = await subject.listTransactions(CLINIC)

    expect(calls.some((call) => call.method === 'eq' && call.args[0] === 'clinic_id' && call.args[1] === CLINIC)).toBe(true)
    expect(transactions[0]).toMatchObject({
      status: 'reconciled',
      bankAccountName: 'Conta principal',
      reconciliation: { invoiceId: INVOICE, matchedAmountCents: 12500 },
    })
  })

  it('transação sem vínculo devolve reconciliation nulo, e não um objeto vazio', async () => {
    const { subject } = repository({ rows: () => [transactionRow()] })

    const transactions = await subject.listTransactions(CLINIC)

    expect(transactions[0].reconciliation).toBeNull()
  })
})

/**
 * Só fatura emitida pode receber dinheiro do extrato.
 *
 * A consulta trazia TODAS as faturas da clínica — as despesas já filtravam
 * `paid_at is null`, mas aqui não havia filtro nenhum. `draft` é uma fatura que
 * ninguém cobrou, `canceled` é uma anulada de propósito, e a RPC não protege de
 * nenhuma das duas: ela só confere que a fatura existe na clínica.
 */
describe('candidatos', () => {
  it('faturas em rascunho e canceladas ficam de fora', async () => {
    const { subject, argsOf } = repository({ rows: () => [] })

    await subject.listInvoiceCandidates(CLINIC)

    const filtro = argsOf('in').find(([coluna]) => coluna === 'status')
    expect(filtro, 'a consulta de faturas precisa filtrar por status').toBeTruthy()

    const permitidos = filtro?.[1] as readonly string[]
    expect(permitidos).not.toContain('draft')
    expect(permitidos).not.toContain('canceled')
    expect(permitidos).toContain('issued')
  })

  it('despesas já pagas ficam de fora', async () => {
    const { subject, argsOf } = repository({ rows: () => [] })

    await subject.listPayableCandidates(CLINIC)

    expect(argsOf('is')).toContainEqual(['paid_at', null])
  })
})

describe('ignorar e devolver para a fila', () => {
  it('prende o UPDATE ao estado que a tela viu', async () => {
    /*
     * O `.eq('status', from)` é o que dispensa uma função de banco: se outra
     * pessoa conciliou nesse intervalo, zero linhas mudam. Sem ele, uma
     * transação com evidência gravada seria rebaixada para `ignored` e o
     * vínculo ficaria apontando para uma transação que nega ter sido conciliada.
     */
    const { subject, argsOf } = repository({ row: transactionRow({ status: 'ignored' }) })

    await subject.setTransactionStatus(CLINIC, TRANSACTION, 'pending', 'ignored')

    const eqs = argsOf('eq')
    expect(eqs).toContainEqual(['status', 'pending'])
    expect(eqs).toContainEqual(['clinic_id', CLINIC])
    expect(eqs).toContainEqual(['id', TRANSACTION])
  })

  it('grava só o status — nunca valor, data ou descrição', async () => {
    // O extrato é evidência. Poder "consertar" um lançamento até ele casar com
    // alguma fatura é o oposto do que a conciliação serve para provar.
    const { subject, argsOf } = repository({ row: transactionRow({ status: 'ignored' }) })

    await subject.setTransactionStatus(CLINIC, TRANSACTION, 'pending', 'ignored')

    const patch = argsOf('update')[0][0] as Record<string, unknown>
    expect(Object.keys(patch).sort()).toEqual(['status', 'updated_at'])
  })

  it('nenhuma linha alterada vira not-found, e não sucesso silencioso', async () => {
    const { subject } = repository({ row: null })

    await expect(
      subject.setTransactionStatus(CLINIC, TRANSACTION, 'pending', 'ignored'),
    ).rejects.toMatchObject({ reason: 'not-found' })
  })
})

describe('conciliação', () => {
  it('manda o alvo escolhido e deixa o outro nulo', async () => {
    const { subject, calls } = repository()

    await subject.reconcileTransaction(CLINIC, {
      transactionId: TRANSACTION,
      invoiceId: INVOICE,
      payableId: null,
      notes: 'Confere com o extrato',
    })

    const rpc = calls.find((call) => call.table === 'rpc:reconcile_bank_transaction')
    expect(rpc?.args[0]).toEqual({
      p_clinic_id: CLINIC,
      p_transaction_id: TRANSACTION,
      p_invoice_id: INVOICE,
      p_payable_id: null,
      p_notes: 'Confere com o extrato',
    })
  })

  it('não inventa a clínica: manda a que recebeu', async () => {
    const { subject, calls } = repository()

    await subject.reconcileTransaction(OTHER_CLINIC, {
      transactionId: TRANSACTION,
      invoiceId: null,
      payableId: PAYABLE,
      notes: null,
    })

    expect(calls[0].args[0]).toMatchObject({ p_clinic_id: OTHER_CLINIC, p_payable_id: PAYABLE })
  })

  it('devolve o valor casado que o banco gravou', async () => {
    const { subject } = repository({ rpcRow: reconciliationRow({ matched_amount_cents: 50_000 }) })

    const result = await subject.reconcileTransaction(CLINIC, {
      transactionId: TRANSACTION,
      invoiceId: INVOICE,
      payableId: null,
      notes: null,
    })

    expect(result.matchedAmountCents).toBe(50_000)
  })
})

describe('tradução das recusas do banco', () => {
  async function reasonOf(error: { code?: string | null; message?: string | null }) {
    const { subject } = repository({ error })
    return subject
      .listTransactions(CLINIC)
      .then(() => 'sem erro')
      .catch((cause: { reason: string }) => cause.reason)
  }

  it('tabela ausente é migration pendente', async () => {
    expect(await reasonOf({ code: '42P01' })).toBe('schema-not-ready')
    expect(await reasonOf({ code: 'PGRST205' })).toBe('schema-not-ready')
  })

  it('função ausente também é migration pendente, e não falha inesperada', async () => {
    // Aplicar a migration pela metade faria a tela pedir "tente de novo" numa
    // função que não vai passar a existir por tentativa.
    expect(await reasonOf({ code: '42883' })).toBe('schema-not-ready')
    expect(await reasonOf({ code: 'PGRST202' })).toBe('schema-not-ready')
  })

  it('recusa da policy é forbidden', async () => {
    expect(await reasonOf({ code: '42501' })).toBe('forbidden')
    expect(await reasonOf({ message: 'clinic_scope' })).toBe('forbidden')
  })

  it('transação já processada NÃO se confunde com alvo inválido', async () => {
    /*
     * O caso que estava dobrado. As duas recusas chegam como `22023`, e as duas
     * viravam "escolha uma fatura ou uma despesa" — instrução que não resolve
     * nem uma nem outra. Quem esbarrasse numa transação conciliada por um
     * colega trocaria de alvo e falharia de novo, indefinidamente.
     */
    expect(await reasonOf({ code: '22023', message: 'bank_transaction_already_processed' })).toBe('already-processed')
    expect(await reasonOf({ code: '22023', message: 'reconciliation_target_invalid' })).toBe('invalid')
  })

  it('sentido incompatível tem motivo próprio', async () => {
    expect(await reasonOf({ code: '22023', message: 'invoice_reconciliation_invalid' })).toBe('direction-mismatch')
    expect(await reasonOf({ code: '22023', message: 'payable_reconciliation_invalid' })).toBe('direction-mismatch')
  })

  it('transação inexistente é not-found', async () => {
    expect(await reasonOf({ code: 'P0002' })).toBe('not-found')
  })

  it('identificador externo repetido é duplicidade, e não erro genérico', async () => {
    // O índice único por (clínica, conta, external_id) é o que torna a
    // importação repetível sem duplicar lançamento.
    expect(await reasonOf({ code: '23505' })).toBe('duplicate')
  })

  it('queda de rede é retentável', async () => {
    expect(await reasonOf({ message: 'fetch failed' })).toBe('unavailable')
  })

  it('o código do Postgres fica no erro, para o log — não para a tela', async () => {
    const { subject } = repository({ error: { code: '23505' } })

    await expect(subject.listAccounts(CLINIC)).rejects.toMatchObject({
      reason: 'duplicate',
      code: '23505',
    })
  })
})

describe('escrita', () => {
  it('a conta nasce com o autor da sessão', async () => {
    const { subject, argsOf } = repository({
      row: { id: ACCOUNT, clinic_id: CLINIC, name: 'Conta principal', bank_name: null, last_four: null, notes: null, is_active: true, updated_at: '2026-08-09T10:00:00.000Z' },
    })

    await subject.createAccount(CLINIC, USER, { name: 'Conta principal', bankName: null, lastFour: null, notes: null })

    expect(argsOf('insert')[0][0]).toMatchObject({ clinic_id: CLINIC, created_by: USER })
  })

  it('a transação grava a data como dia, sem hora', async () => {
    // `occurred_on` é `date` no banco; mandar ISO completo dependeria do fuso
    // do servidor para decidir o dia.
    const { subject, argsOf } = repository({ row: transactionRow() })

    await subject.createTransaction(CLINIC, USER, {
      bankAccountId: ACCOUNT,
      occurredOn: new Date('2026-08-09T23:30:00.000Z'),
      direction: 'credit',
      amountCents: 12500,
      description: 'Recebimento via PIX',
      externalId: null,
      notes: null,
    })

    expect(argsOf('insert')[0][0]).toMatchObject({ occurred_on: '2026-08-09' })
  })
})
