import { describe, expect, it, vi } from 'vitest'

import { isTaskRepositoryError } from '../domain/TaskRepositoryError'
import { SupabaseTaskRepository } from './SupabaseTaskRepository'

/**
 * A leitura que o Portal do profissional faz — `listAssignedTo`.
 *
 * O fake grava a cadeia de chamadas do supabase-js em vez de falar com o banco.
 * **Nenhuma chamada de rede.** Isolamento real de tenant continua sendo pgTAP
 * (R1); o que se afirma aqui é o contrato da APLICAÇÃO: quais filtros ela envia
 * e como traduz cada recusa.
 *
 * O ponto destes testes é *onde* o recorte acontece. Trazer a clínica inteira e
 * separar em memória entregaria ao portal de uma pessoa as tarefas de todas as
 * outras, pelo payload — mesmo que a tela mostrasse só as dela.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const OTHER_USER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const TASK = '11111111-1111-4111-8111-111111111111'

interface RecordedCall {
  method: string
  args: unknown[]
}

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    clinic_id: CLINIC,
    title: 'Ligar para a paciente que faltou',
    notes: null,
    status: 'pending',
    source: 'manual',
    priority: 2,
    due_at: '2026-08-10T17:00:00.000Z',
    assigned_to: USER,
    created_by: USER,
    patient_id: '22222222-2222-4222-8222-222222222222',
    appointment_id: null,
    invoice_id: null,
    completed_at: null,
    created_at: '2026-08-09T12:00:00.000Z',
    updated_at: '2026-08-09T12:00:00.000Z',
    assignee: { id: USER, full_name: 'Dra. Marina Alves' },
    patient: { id: '22222222-2222-4222-8222-222222222222', full_name: 'Ana Souza' },
    ...overrides,
  }
}

function createFakeClient(options: {
  rows?: unknown[]
  row?: unknown
  error?: { code?: string; message?: string }
} = {}) {
  const calls: RecordedCall[] = []

  const query: Record<string, unknown> = {}

  for (const method of ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update']) {
    query[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return query
    }
  }

  const single = async () => {
    calls.push({ method: 'single', args: [] })
    return {
      // `'row' in options` e nao `?? taskRow()`: a linha ausente — tarefa de
      // outra clinica — e justamente o caso sob teste, e `null ??` a apagaria.
      data: options.error ? null : 'row' in options ? options.row : taskRow(),
      error: options.error ?? null,
    }
  }

  query.single = single
  query.maybeSingle = single

  query.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) =>
    Promise.resolve({
      // `'rows' in options`, e nao `?? []`: lista vazia e um caso sob teste, e
      // `??` a confundiria com ausencia.
      data: options.error ? null : ('rows' in options ? options.rows : [taskRow()]),
      error: options.error ?? null,
    }).then(onFulfilled, onRejected)

  const from = vi.fn(() => query)

  return { calls, client: { from } as never, from }
}

function subject(options: Parameters<typeof createFakeClient>[0] = {}) {
  const fake = createFakeClient(options)
  return { fake, repository: new SupabaseTaskRepository(fake.client) }
}

describe('listAssignedTo', () => {
  it('filtra por clínica E por responsável, no banco', async () => {
    const { fake, repository } = subject({ rows: [] })

    await repository.listAssignedTo(CLINIC, USER)

    expect(fake.calls).toContainEqual({
      method: 'eq',
      args: ['clinic_id', CLINIC],
    })
    expect(fake.calls).toContainEqual({
      method: 'eq',
      args: ['assigned_to', USER],
    })
  })

  it('não envia o responsável de outra pessoa', async () => {
    /*
     * Parece redundante com o teste acima, e não é: prende a troca de
     * argumentos. `listAssignedTo(clinicId, assigneeId)` com os dois na ordem
     * errada compila, roda, e devolve zero para todo mundo em silêncio.
     */
    const { fake, repository } = subject({ rows: [] })

    await repository.listAssignedTo(CLINIC, USER)

    expect(fake.calls).not.toContainEqual({
      method: 'eq',
      args: ['assigned_to', OTHER_USER],
    })
    expect(fake.calls).not.toContainEqual({
      method: 'eq',
      args: ['assigned_to', CLINIC],
    })
  })

  it('pede só o que ainda está aberto', async () => {
    /*
     * `done` e `canceled` ficam de fora. O portal responde "o que falta eu
     * fazer": a primeira já foi feita, e a segunda alguém decidiu não fazer.
     * `/tarefas` mostra as concluídas porque é a visão de coordenação — esta
     * não é.
     */
    const { fake, repository } = subject({ rows: [] })

    await repository.listAssignedTo(CLINIC, USER)

    expect(fake.calls).toContainEqual({
      method: 'in',
      args: ['status', ['pending', 'in_progress']],
    })
  })

  it('ordena por prioridade e depois por prazo', async () => {
    const { fake, repository } = subject({ rows: [] })

    await repository.listAssignedTo(CLINIC, USER)

    const ordens = fake.calls.filter((call) => call.method === 'order')

    expect(ordens).toEqual([
      { method: 'order', args: ['priority', { ascending: true }] },
      { method: 'order', args: ['due_at', { ascending: true }] },
    ])
  })

  it('limita as linhas', async () => {
    const { fake, repository } = subject({ rows: [] })

    await repository.listAssignedTo(CLINIC, USER)

    expect(fake.calls).toContainEqual({ method: 'limit', args: [200] })
  })

  it('mapeia a linha, com paciente e responsável do join', async () => {
    const { repository } = subject({ rows: [taskRow()] })

    const [task] = await repository.listAssignedTo(CLINIC, USER)

    expect(task.title).toBe('Ligar para a paciente que faltou')
    expect(task.priority).toBe(2)
    expect(task.assignee).toEqual({ id: USER, name: 'Dra. Marina Alves' })
    expect(task.target.patientName).toBe('Ana Souza')
    expect(task.dueAt).toEqual(new Date('2026-08-10T17:00:00.000Z'))
  })

  it('tarefa sem paciente e sem prazo não quebra o mapeamento', async () => {
    const { repository } = subject({
      rows: [taskRow({ patient_id: null, patient: null, due_at: null })],
    })

    const [task] = await repository.listAssignedTo(CLINIC, USER)

    expect(task.target.patientName).toBeNull()
    expect(task.dueAt).toBeNull()
  })

  it('ninguém com tarefa devolve lista vazia, não erro', async () => {
    const { repository } = subject({ rows: [] })

    await expect(repository.listAssignedTo(CLINIC, USER)).resolves.toEqual([])
  })

  it('tabela ausente vira schema-not-ready, e não indisponibilidade', async () => {
    /*
     * A distinção que o portal depende: `schema-not-ready` significa "a
     * migration não foi aplicada" e a tela declara a pendência; `unavailable`
     * significa "tente de novo" e faria a tela sugerir recarregar para sempre.
     */
    const { repository } = subject({ error: { code: '42P01' } })

    await expect(repository.listAssignedTo(CLINIC, USER)).rejects.toSatisfy(
      (cause: unknown) =>
        isTaskRepositoryError(cause) && cause.reason === 'schema-not-ready',
    )
  })

  it('PostgREST sem a relação no cache também é schema-not-ready', async () => {
    const { repository } = subject({ error: { code: 'PGRST205' } })

    await expect(repository.listAssignedTo(CLINIC, USER)).rejects.toSatisfy(
      (cause: unknown) =>
        isTaskRepositoryError(cause) && cause.reason === 'schema-not-ready',
    )
  })

  it('recusa de policy vira forbidden', async () => {
    const { repository } = subject({ error: { code: '42501' } })

    await expect(repository.listAssignedTo(CLINIC, USER)).rejects.toSatisfy(
      (cause: unknown) =>
        isTaskRepositoryError(cause) && cause.reason === 'forbidden',
    )
  })
})

/**
 * A leitura da tela de tarefas, e as três escritas.
 *
 * `listAssignedTo` já tinha cobertura — ela nasceu com o portal do profissional.
 * O resto do repositório não tinha nenhuma, e é o que a tela `/tarefas` usa o
 * tempo todo.
 */
describe('list', () => {
  it('prende a clínica', async () => {
    const { fake, repository } = subject({ rows: [] })

    await repository.list(CLINIC)

    expect(fake.calls).toContainEqual({ method: 'eq', args: ['clinic_id', CLINIC] })
  })

  it('traz abertas e concluídas, mas nunca canceladas', async () => {
    /*
     * Cancelada registra que alguém decidiu NÃO fazer. Não é pendência nem
     * histórico de trabalho feito — sem o filtro, a lista de "concluídas"
     * misturaria as duas coisas.
     */
    const { fake, repository } = subject({ rows: [] })

    await repository.list(CLINIC)

    expect(fake.calls).toContainEqual({
      method: 'in',
      args: ['status', ['pending', 'in_progress', 'done']],
    })
  })

  it('ordena por prioridade e depois por prazo', async () => {
    const { fake, repository } = subject({ rows: [] })

    await repository.list(CLINIC)

    expect(fake.calls.filter((call) => call.method === 'order')).toEqual([
      { method: 'order', args: ['priority', { ascending: true }] },
      { method: 'order', args: ['due_at', { ascending: true }] },
    ])
  })

  it('limita as linhas', async () => {
    const { fake, repository } = subject({ rows: [] })

    await repository.list(CLINIC)

    expect(fake.calls).toContainEqual({ method: 'limit', args: [200] })
  })

  it('clínica sem tarefa devolve lista vazia, não erro', async () => {
    const { repository } = subject({ rows: [] })

    await expect(repository.list(CLINIC)).resolves.toEqual([])
  })
})

describe('create', () => {
  const data = {
    title: 'Ligar para a paciente',
    notes: null,
    assigneeId: USER,
    dueAt: new Date('2026-08-12T23:59:59.999Z'),
    priority: 1,
    patientId: '22222222-2222-4222-8222-222222222222',
  }

  it('grava o clinic_id e o autor do contexto, nunca do cliente', async () => {
    const { fake, repository } = subject()

    await repository.create(CLINIC, USER, data)

    const values = fake.calls.find((call) => call.method === 'insert')
      ?.args[0] as Record<string, unknown>

    expect(values.clinic_id).toBe(CLINIC)
    expect(values.created_by).toBe(USER)
  })

  it('nasce pendente, e a tela não escolhe o estado inicial', async () => {
    /*
     * Se o estado viesse da entrada, dava para criar uma tarefa já concluída —
     * que é registro de trabalho que ninguém fez.
     */
    const { fake, repository } = subject()

    await repository.create(CLINIC, USER, data)

    const values = fake.calls.find((call) => call.method === 'insert')
      ?.args[0] as Record<string, unknown>

    expect(values.status).toBe('pending')
    expect(values).not.toHaveProperty('completed_at')
  })

  it('o prazo vai como ISO, e sem prazo vai nulo', async () => {
    const { fake, repository } = subject()

    await repository.create(CLINIC, USER, { ...data, dueAt: null })

    const values = fake.calls.find((call) => call.method === 'insert')
      ?.args[0] as Record<string, unknown>

    expect(values.due_at).toBeNull()
  })
})

describe('update', () => {
  const patch = {
    title: 'Confirmar a guia',
    notes: 'operadora devolveu',
    assigneeId: null,
    dueAt: null,
    priority: 3,
    patientId: null,
  }

  it('prende clínica E id', async () => {
    const { fake, repository } = subject()

    await repository.update(CLINIC, TASK, patch)

    expect(fake.calls).toContainEqual({ method: 'eq', args: ['clinic_id', CLINIC] })
    expect(fake.calls).toContainEqual({ method: 'eq', args: ['id', TASK] })
  })

  it('não mexe no estado da tarefa', async () => {
    /*
     * Concluir, reabrir e cancelar têm action própria, com auditoria própria.
     * Se a edição pudesse escrever `status`, a mesma mudança teria dois
     * caminhos e um deles registraria o evento errado.
     */
    const { fake, repository } = subject()

    await repository.update(CLINIC, TASK, patch)

    const values = fake.calls.find((call) => call.method === 'update')
      ?.args[0] as Record<string, unknown>

    expect(values).not.toHaveProperty('status')
    expect(values).not.toHaveProperty('completed_at')
  })

  it('tarefa de outra clínica vira not-found', async () => {
    const { repository } = subject({ row: null })

    await expect(repository.update(CLINIC, TASK, patch)).rejects.toSatisfy(
      (cause: unknown) =>
        isTaskRepositoryError(cause) && cause.reason === 'not-found',
    )
  })
})

describe('setStatus', () => {
  it('concluir carimba completed_at', async () => {
    const { fake, repository } = subject()

    await repository.setStatus(CLINIC, TASK, 'done')

    const values = fake.calls.find((call) => call.method === 'update')
      ?.args[0] as Record<string, unknown>

    expect(values.status).toBe('done')
    expect(typeof values.completed_at).toBe('string')
  })

  it('reabrir LIMPA completed_at', async () => {
    /*
     * Deixá-la para trás faria uma tarefa aberta carregar data de conclusão —
     * e qualquer contagem de "resolvidas no mês" passaria a mentir.
     */
    const { fake, repository } = subject()

    await repository.setStatus(CLINIC, TASK, 'pending')

    const values = fake.calls.find((call) => call.method === 'update')
      ?.args[0] as Record<string, unknown>

    expect(values.completed_at).toBeNull()
  })

  it('cancelar também não carimba conclusão', async () => {
    // Cancelada é "não era para fazer", não "foi feita".
    const { fake, repository } = subject()

    await repository.setStatus(CLINIC, TASK, 'canceled')

    const values = fake.calls.find((call) => call.method === 'update')
      ?.args[0] as Record<string, unknown>

    expect(values.status).toBe('canceled')
    expect(values.completed_at).toBeNull()
  })

  it('é update, e nunca delete', async () => {
    const { fake, repository } = subject()

    await repository.setStatus(CLINIC, TASK, 'canceled')

    expect(fake.calls.some((call) => call.method === 'delete')).toBe(false)
  })

  it('prende a clínica', async () => {
    const { fake, repository } = subject()

    await repository.setStatus(CLINIC, TASK, 'done')

    expect(fake.calls).toContainEqual({ method: 'eq', args: ['clinic_id', CLINIC] })
  })

  it('tarefa inexistente vira not-found', async () => {
    const { repository } = subject({ row: null })

    await expect(repository.setStatus(CLINIC, TASK, 'done')).rejects.toSatisfy(
      (cause: unknown) =>
        isTaskRepositoryError(cause) && cause.reason === 'not-found',
    )
  })
})
