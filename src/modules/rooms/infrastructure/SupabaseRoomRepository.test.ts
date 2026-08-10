import { describe, expect, it, vi } from 'vitest'

import { isRoomRepositoryError } from '../domain/RoomRepositoryError'
import { SupabaseRoomRepository } from './SupabaseRoomRepository'

/**
 * Contrato do adapter de salas.
 *
 * O fake grava a cadeia de chamadas do supabase-js em vez de falar com o banco.
 * **Nenhuma chamada de rede.** Isolamento real continua sendo pgTAP (R1); o que
 * se afirma aqui é o que a aplicação envia e como ela traduz cada recusa.
 *
 * Dois grupos de teste valem mais que o resto:
 *
 *  - **`deleted_at`**, que até 10/08/2026 nenhum caminho escrevia. A coluna
 *    existia na migration, a leitura a respeitava, e nada a preenchia: sala
 *    criada por engano ficava para sempre, com o nome preso pelo índice único
 *    parcial.
 *  - **a classificação da ESCRITA**, que só reconhecia `23505` e mandava o
 *    resto para `unexpected` — deixando dois ramos de `roomFailure`
 *    inalcançáveis por qualquer escrita.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const OTHER_CLINIC = 'ffffffff-0000-4000-8000-00000000ffff'
const ROOM = '9019956f-bdd8-4d61-868d-09b02332dad0'

interface RecordedCall {
  method: string
  args: unknown[]
}

function roomRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ROOM,
    clinic_id: CLINIC,
    name: 'Consultório 1',
    kind: 'consultorio',
    capacity: 3,
    notes: 'Térreo',
    is_active: true,
    created_at: '2026-08-09T12:00:00.000Z',
    updated_at: '2026-08-09T12:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

function createFakeClient(
  options: {
    rows?: unknown[]
    row?: unknown
    error?: { code?: string; message?: string }
  } = {},
) {
  const calls: RecordedCall[] = []
  const query: Record<string, unknown> = {}

  for (const method of ['select', 'eq', 'is', 'order', 'insert', 'update']) {
    query[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return query
    }
  }

  const single = async () => {
    calls.push({ method: 'single', args: [] })
    return {
      // `'row' in options` e nao `?? roomRow()`: a linha ausente — sala de
      // outra clinica, ou ja removida — e justamente o caso sob teste.
      data: options.error ? null : 'row' in options ? options.row : roomRow(),
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
      data: options.error ? null : (options.rows ?? [roomRow()]),
      error: options.error ?? null,
    }).then(onFulfilled, onRejected)

  return { calls, client: { from: vi.fn(() => query) } as never }
}

function subject(options: Parameters<typeof createFakeClient>[0] = {}) {
  const fake = createFakeClient(options)
  return { fake, repository: new SupabaseRoomRepository(fake.client) }
}

describe('list', () => {
  it('prende a clínica e ignora as removidas', async () => {
    const { fake, repository } = subject({ rows: [] })

    await repository.list(CLINIC)

    expect(fake.calls).toContainEqual({ method: 'eq', args: ['clinic_id', CLINIC] })
    expect(fake.calls).toContainEqual({ method: 'is', args: ['deleted_at', null] })
  })

  it('não vaza a clínica de outra pessoa', async () => {
    const { fake, repository } = subject({ rows: [] })

    await repository.list(CLINIC)

    expect(fake.calls).not.toContainEqual({
      method: 'eq',
      args: ['clinic_id', OTHER_CLINIC],
    })
  })

  it('mapeia a linha para a entidade', async () => {
    const { repository } = subject({ rows: [roomRow()] })

    const [room] = await repository.list(CLINIC)

    expect(room).toMatchObject({
      id: ROOM,
      clinicId: CLINIC,
      name: 'Consultório 1',
      kind: 'consultorio',
      capacity: 3,
      isActive: true,
    })
    expect(room.createdAt).toEqual(new Date('2026-08-09T12:00:00.000Z'))
  })

  it('clínica sem sala devolve lista vazia, não erro', async () => {
    const { repository } = subject({ rows: [] })

    await expect(repository.list(CLINIC)).resolves.toEqual([])
  })

  it('tabela ausente vira schema-not-ready', async () => {
    /*
     * A distinção que a rota depende: `schema-not-ready` faz a tela declarar a
     * pendência da migration; `unavailable` faria a pessoa recarregar para
     * sempre sobre um problema que nenhuma tentativa resolve.
     */
    const { repository } = subject({ error: { code: '42P01' } })

    await expect(repository.list(CLINIC)).rejects.toSatisfy(
      (cause: unknown) =>
        isRoomRepositoryError(cause) && cause.reason === 'schema-not-ready',
    )
  })
})

describe('create', () => {
  it('grava o clinic_id do contexto e nasce ativa', async () => {
    const { fake, repository } = subject()

    await repository.create(CLINIC, {
      name: 'Sala 2',
      kind: 'sala_exame',
      capacity: 2,
      notes: null,
    })

    const insert = fake.calls.find((call) => call.method === 'insert')
    const values = insert?.args[0] as Record<string, unknown>

    expect(values.clinic_id).toBe(CLINIC)
    expect(values.is_active).toBe(true)
    // `deleted_at` nao entra no insert: o default da coluna e nulo, e mandá-lo
    // daqui seria a aplicacao decidindo algo que o banco ja decide.
    expect(values).not.toHaveProperty('deleted_at')
  })

  it('nome repetido vira conflito, e não erro inesperado', async () => {
    const { repository } = subject({ error: { code: '23505' } })

    await expect(
      repository.create(CLINIC, {
        name: 'Consultório 1',
        kind: 'consultorio',
        capacity: null,
        notes: null,
      }),
    ).rejects.toSatisfy(
      (cause: unknown) =>
        isRoomRepositoryError(cause) && cause.reason === 'conflict',
    )
  })
})

describe('update', () => {
  it('prende clínica E id, e não toca em sala removida', async () => {
    const { fake, repository } = subject()

    await repository.update(CLINIC, ROOM, {
      name: 'Consultório 1A',
      kind: 'consultorio',
      capacity: 4,
      notes: null,
    })

    expect(fake.calls).toContainEqual({ method: 'eq', args: ['clinic_id', CLINIC] })
    expect(fake.calls).toContainEqual({ method: 'eq', args: ['id', ROOM] })
    expect(fake.calls).toContainEqual({ method: 'is', args: ['deleted_at', null] })
  })

  it('sala de outra clínica vira not-found', async () => {
    /*
     * A RLS já não devolveria a linha; o `not-found` é o que transforma isso em
     * mensagem em vez de num `null` que a camada de cima teria de adivinhar.
     */
    const { repository } = subject({ row: null })

    await expect(
      repository.update(CLINIC, ROOM, {
        name: 'X',
        kind: 'consultorio',
        capacity: null,
        notes: null,
      }),
    ).rejects.toSatisfy(
      (cause: unknown) =>
        isRoomRepositoryError(cause) && cause.reason === 'not-found',
    )
  })
})

describe('setActive', () => {
  it('é update de is_active, e nunca delete', async () => {
    const { fake, repository } = subject()

    await repository.setActive(CLINIC, ROOM, false)

    const update = fake.calls.find((call) => call.method === 'update')

    expect((update?.args[0] as Record<string, unknown>).is_active).toBe(false)
    expect(fake.calls.some((call) => call.method === 'delete')).toBe(false)
  })

  it('desativar NÃO remove — `deleted_at` fica intacto', async () => {
    /*
     * As duas coisas parecem a mesma e não são. Desativada continua ocupando o
     * nome no índice único parcial; removida libera. Se `setActive` escrevesse
     * `deleted_at`, desativar viraria remoção silenciosa.
     */
    const { fake, repository } = subject()

    await repository.setActive(CLINIC, ROOM, false)

    const update = fake.calls.find((call) => call.method === 'update')

    expect(update?.args[0]).not.toHaveProperty('deleted_at')
  })
})

describe('archive', () => {
  it('escreve deleted_at e desativa junto', async () => {
    const { fake, repository } = subject()

    await repository.archive(CLINIC, ROOM)

    const update = fake.calls.find((call) => call.method === 'update')
    const values = update?.args[0] as Record<string, unknown>

    expect(typeof values.deleted_at).toBe('string')
    expect(values.is_active).toBe(false)
  })

  it('continua sendo update, e não delete', async () => {
    /*
     * `appointments.room_id` referencia a linha: apagar de verdade quebraria o
     * histórico de onde cada pessoa foi atendida. A migration não cria policy
     * de DELETE justamente por isso.
     */
    const { fake, repository } = subject()

    await repository.archive(CLINIC, ROOM)

    expect(fake.calls.some((call) => call.method === 'delete')).toBe(false)
  })

  it('prende a clínica', async () => {
    const { fake, repository } = subject()

    await repository.archive(CLINIC, ROOM)

    expect(fake.calls).toContainEqual({ method: 'eq', args: ['clinic_id', CLINIC] })
    expect(fake.calls).toContainEqual({ method: 'eq', args: ['id', ROOM] })
  })

  it('remover duas vezes vira not-found', async () => {
    // `.is('deleted_at', null)` faz a segunda chamada não encontrar nada — e
    // "já foi removida" é a resposta certa, não um sucesso silencioso.
    const { repository } = subject({ row: null })

    await expect(repository.archive(CLINIC, ROOM)).rejects.toSatisfy(
      (cause: unknown) =>
        isRoomRepositoryError(cause) && cause.reason === 'not-found',
    )
  })
})

describe('classificação da escrita', () => {
  /*
   * O grupo que não existia. `toWriteError` só reconhecia `23505`; todo o resto
   * virava `unexpected`, e com isso duas mensagens de `roomFailure` nunca
   * chegavam a ninguém.
   */
  const write = () =>
    subject({ error: { code: '42P01' } }).repository.create(CLINIC, {
      name: 'Sala',
      kind: 'consultorio',
      capacity: null,
      notes: null,
    })

  it('migration pendente diz que é migration, mesmo escrevendo', async () => {
    await expect(write()).rejects.toSatisfy(
      (cause: unknown) =>
        isRoomRepositoryError(cause) && cause.reason === 'schema-not-ready',
    )
  })

  it('recusa de policy vira forbidden na escrita', async () => {
    const { repository } = subject({ error: { code: '42501' } })

    await expect(repository.setActive(CLINIC, ROOM, false)).rejects.toSatisfy(
      (cause: unknown) =>
        isRoomRepositoryError(cause) && cause.reason === 'forbidden',
    )
  })

  it('falha de rede vira unavailable, que pede nova tentativa', async () => {
    const { repository } = subject({ error: { message: 'fetch failed' } })

    await expect(repository.archive(CLINIC, ROOM)).rejects.toSatisfy(
      (cause: unknown) =>
        isRoomRepositoryError(cause) && cause.reason === 'unavailable',
    )
  })
})
