import { describe, expect, it, vi } from 'vitest'

import { SupabaseAutomationRepository } from './SupabaseAutomationRepository'

/**
 * Contrato das automações.
 *
 * Sem banco e sem rede — o cliente é um duplo. `workflows` já existe no banco
 * aplicado, então não há caso de migration pendente: o que se prova é o escopo
 * de tenant, a reconstrução do `jsonb` pelo mesmo schema da escrita, e a
 * distinção entre "a regra sumiu", "a policy recusou" e "há execuções".
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const OTHER_CLINIC = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const RULE = '11111111-1111-4111-8111-111111111111'

interface RecordedCall {
  table: string
  method: string
  args: unknown[]
}

function workflowRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RULE,
    clinic_id: CLINIC,
    name: 'Lembrar recepção',
    description: null,
    trigger_type: 'appointment_reminder',
    trigger_config: { kind: 'reminder', hoursBefore: 24 },
    conditions: [],
    actions: [{ type: 'notify_team', roles: ['receptionist'], message: 'Confirmar' }],
    is_active: false,
    last_run_at: null,
    updated_at: '2026-08-10T10:00:00.000Z',
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
    subject: new SupabaseAutomationRepository({ from } as never),
  }
}

describe('leitura', () => {
  it('filtra pela clínica recebida', async () => {
    const { subject, argsOf } = repository({ rows: [workflowRow()] })

    await subject.listRules(OTHER_CLINIC)

    expect(argsOf('eq')).toContainEqual(['clinic_id', OTHER_CLINIC])
  })

  it('reconstrói o jsonb pelo mesmo schema da escrita', async () => {
    const { subject } = repository({ rows: [workflowRow()] })

    const [rule] = await subject.listRules(CLINIC)

    expect(rule.triggerConfig).toEqual({ kind: 'reminder', hoursBefore: 24 })
    expect(rule.actions).toEqual([
      { type: 'notify_team', roles: ['receptionist'], message: 'Confirmar' },
    ])
  })
})

/**
 * A defesa que importa nesta fatia.
 *
 * `trigger_config`, `conditions` e `actions` são `jsonb`, e o banco aceita
 * qualquer coisa neles. Linha gravada por fora da aplicação — console do
 * Supabase, script, um worker futuro — pode ter forma que a tela não conhece.
 */
describe('jsonb que a aplicação não reconhece', () => {
  it('ação desconhecida é descartada, não exibida crua', async () => {
    const { subject } = repository({
      rows: [
        workflowRow({
          actions: [
            { type: 'send_whatsapp', to: '+55...', body: 'oi' },
            { type: 'notify_team', roles: ['admin'], message: 'Conferir agenda' },
          ],
        }),
      ],
    })

    const [rule] = await subject.listRules(CLINIC)

    expect(rule.actions).toEqual([{ type: 'notify_team', roles: ['admin'], message: 'Conferir agenda' }])
  })

  it('configuração ilegível vira `event`, sem inventar parâmetro', async () => {
    /*
     * Chutar `{ hoursBefore: 24 }` para um gatilho de lembrete colocaria no
     * formulário um número que ninguém configurou, como se fosse escolha da
     * clínica.
     */
    const { subject } = repository({ rows: [workflowRow({ trigger_config: { foo: 'bar' } })] })

    const [rule] = await subject.listRules(CLINIC)

    expect(rule.triggerConfig).toEqual({ kind: 'event' })
  })

  it('conditions que não é array não quebra a leitura', async () => {
    const { subject } = repository({ rows: [workflowRow({ conditions: { field: 'x' } })] })

    const [rule] = await subject.listRules(CLINIC)

    expect(rule.conditions).toEqual([])
  })

  it('condição com faixa invertida é descartada', async () => {
    // Ela nunca casaria; mostrá-la sugeriria uma regra que funciona.
    const { subject } = repository({
      rows: [workflowRow({ conditions: [{ field: 'hour_range', from: '18:00', to: '08:00' }] })],
    })

    const [rule] = await subject.listRules(CLINIC)

    expect(rule.conditions).toEqual([])
  })
})

describe('escrita', () => {
  it('a regra nasce com a clínica e o autor da sessão', async () => {
    const { subject, argsOf } = repository({ singles: [workflowRow()] })

    await subject.createRule(CLINIC, USER, {
      name: 'Lembrar recepção',
      description: null,
      triggerType: 'appointment_reminder',
      triggerConfig: { kind: 'reminder', hoursBefore: 24 },
      conditions: [],
      actions: [{ type: 'notify_team', roles: ['receptionist'], message: 'Confirmar' }],
      isActive: false,
    })

    expect(argsOf('insert')[0][0]).toMatchObject({ clinic_id: CLINIC, created_by: USER })
  })

  it('o UPDATE de ativação não toca em `last_run_at`', async () => {
    // Quem escreve essa coluna é o executor. A tela não pode fabricar a prova
    // de que a regra rodou.
    const { subject, argsOf } = repository({ singles: [workflowRow({ is_active: true })] })

    await subject.setActive(CLINIC, RULE, true)

    const patch = argsOf('update')[0][0] as Record<string, unknown>
    expect(Object.keys(patch).sort()).toEqual(['is_active', 'updated_at'])
  })

  it('zero linhas com a regra ainda legível é recusa de escrita', async () => {
    const { subject } = repository({ singles: [null, { id: RULE }] })

    await expect(subject.setActive(CLINIC, RULE, true)).rejects.toMatchObject({
      reason: 'write-forbidden',
    })
  })

  it('zero linhas com a regra ausente é not-found', async () => {
    const { subject } = repository({ singles: [null, null] })

    await expect(subject.setActive(CLINIC, RULE, true)).rejects.toMatchObject({
      reason: 'not-found',
    })
  })
})

describe('exclusão', () => {
  it('exclui escopado na clínica', async () => {
    const { subject, argsOf } = repository({ singles: [{ id: RULE }] })

    await subject.deleteRule(CLINIC, RULE)

    expect(argsOf('eq')).toContainEqual(['clinic_id', CLINIC])
    expect(argsOf('eq')).toContainEqual(['id', RULE])
  })

  it('exclusão recusada com a regra ainda legível é write-forbidden', async () => {
    const { subject } = repository({ singles: [null, { id: RULE }] })

    await expect(subject.deleteRule(CLINIC, RULE)).rejects.toMatchObject({
      reason: 'write-forbidden',
    })
  })

  it('violação de FK vira has-runs, e não erro genérico', async () => {
    /*
     * `workflow_runs` referencia `workflows`. Hoje não há execução nenhuma
     * porque não há executor — mas quando houver, apagar a regra apagaria a
     * evidência do que rodou, e a saída certa é desativar.
     */
    const { subject } = repository({ error: { code: '23503' } })

    await expect(subject.deleteRule(CLINIC, RULE)).rejects.toMatchObject({
      reason: 'has-runs',
      code: '23503',
    })
  })
})

describe('tradução das recusas do banco', () => {
  async function reasonOf(error: { code?: string | null; message?: string | null }) {
    const { subject } = repository({ error })
    return subject
      .listRules(CLINIC)
      .then(() => 'sem erro')
      .catch((cause: { reason: string }) => cause.reason)
  }

  it('recusa da policy é forbidden', async () => {
    expect(await reasonOf({ code: '42501' })).toBe('forbidden')
    expect(await reasonOf({ code: 'PGRST301' })).toBe('forbidden')
  })

  it('queda de rede é retentável', async () => {
    expect(await reasonOf({ message: 'fetch failed' })).toBe('unavailable')
  })

  it('o resto é inesperado, e leva o código para o log', async () => {
    const { subject } = repository({ error: { code: '23502' } })

    await expect(subject.listRules(CLINIC)).rejects.toMatchObject({
      reason: 'unexpected',
      code: '23502',
    })
  })
})
