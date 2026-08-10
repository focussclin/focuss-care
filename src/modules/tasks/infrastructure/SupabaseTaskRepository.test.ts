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
  error?: { code?: string; message?: string }
} = {}) {
  const calls: RecordedCall[] = []

  const query: Record<string, unknown> = {}

  for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
    query[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return query
    }
  }

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
