import { describe, expect, it, vi } from 'vitest'

import { SupabaseEncounterRepository } from './SupabaseEncounterRepository'

/**
 * Contrato de escrita do atendimento (E-01).
 *
 * O que este arquivo protege é a **transição sob concorrência**. Duas pessoas
 * da recepção olham a mesma fila em navegadores diferentes; se a segunda puder
 * sobrescrever a primeira, a clínica perde o registro de quando alguém foi
 * chamado ou de quanto durou o atendimento — e ninguém percebe.
 *
 * Sem banco e sem rede: o fake grava a cadeia de chamadas. Tenancy real
 * continua sendo pgTAP (R1).
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const QUEUE_ENTRY = '9019956f-bdd8-4d61-868d-09b02332dad0'
const ENCOUNTER = '11111111-1111-4111-8111-111111111111'
const PROFESSIONAL = '22222222-2222-4222-8222-222222222222'

interface RecordedCall {
  query: number
  table: string
  method: string
  args: unknown[]
}

function queueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: QUEUE_ENTRY,
    patient_id: '33333333-3333-4333-8333-333333333333',
    appointment_id: null,
    professional_id: PROFESSIONAL,
    priority: 5,
    status: 'waiting',
    reason: 'dor no peito',
    arrived_at: '2026-08-07T12:00:00.000Z',
    called_at: null,
    started_at: null,
    finished_at: null,
    patients: { full_name: 'Marina Costa' },
    professionals: { display_name: 'Dra. Helena' },
    ...overrides,
  }
}

function encounterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ENCOUNTER,
    patient_id: '33333333-3333-4333-8333-333333333333',
    professional_id: PROFESSIONAL,
    appointment_id: null,
    status: 'open',
    started_at: '2026-08-07T12:10:00.000Z',
    ended_at: null,
    patients: { full_name: 'Marina Costa' },
    professionals: { display_name: 'Dra. Helena' },
    ...overrides,
  }
}

function createFakeClient(results: {
  queue?: unknown
  encounter?: unknown
  encounterError?: { code?: string; message?: string } | null
}) {
  const calls: RecordedCall[] = []
  let queryIndex = -1

  const from = vi.fn((table: string) => {
    queryIndex += 1
    const index = queryIndex

    const record = (method: string, args: unknown[]) => {
      calls.push({ query: index, table, method, args })
    }

    const query: Record<string, unknown> = {}

    for (const method of ['select', 'eq', 'in', 'gte', 'lt', 'update', 'insert', 'order']) {
      query[method] = (...args: unknown[]) => {
        record(method, args)
        return query
      }
    }

    const payload = () =>
      table === 'encounters'
        ? {
            data:
              'encounter' in results ? results.encounter : encounterRow(),
            error: results.encounterError ?? null,
          }
        : { data: 'queue' in results ? results.queue : queueRow(), error: null }

    query.single = async () => {
      record('single', [])
      return payload()
    }

    query.maybeSingle = async () => {
      record('maybeSingle', [])
      return payload()
    }

    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected)

    return query
  })

  return {
    calls,
    client: { from } as never,
    ofTable: (table: string) => calls.filter((call) => call.table === table),
  }
}

describe('checkIn', () => {
  it('grava a hora da chegada no SERVIDOR', async () => {
    const fake = createFakeClient({})

    await new SupabaseEncounterRepository(fake.client).checkIn(CLINIC, {
      patientId: '33333333-3333-4333-8333-333333333333',
      appointmentId: null,
      professionalId: null,
      priority: 5,
      reason: null,
    })

    const insert = fake
      .ofTable('waiting_queue')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    expect(insert.clinic_id).toBe(CLINIC)
    expect(insert.status).toBe('waiting')
    // O relogio do navegador da recepcao nao pode decidir ha quanto tempo
    // alguem espera: `arrived_at` e o marco zero de tudo que a tela mede.
    expect(insert.arrived_at).toBeTypeOf('string')
  })

  it('aceita encaixe, sem agendamento por trás', async () => {
    const fake = createFakeClient({})

    await new SupabaseEncounterRepository(fake.client).checkIn(CLINIC, {
      patientId: '33333333-3333-4333-8333-333333333333',
      appointmentId: null,
      professionalId: null,
      priority: 1,
      reason: 'encaixe',
    })

    const insert = fake
      .ofTable('waiting_queue')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    // Fila que so aceita quem tinha hora marcada nao corresponde a sala de
    // espera de nenhuma clinica real.
    expect(insert.appointment_id).toBeNull()
    expect(insert.priority).toBe(1)
  })
})

describe('call — waiting -> called', () => {
  it('só chama quem está aguardando', async () => {
    const fake = createFakeClient({ queue: queueRow({ status: 'called' }) })

    await new SupabaseEncounterRepository(fake.client).call(
      CLINIC,
      QUEUE_ENTRY,
    )

    const calls = fake.ofTable('waiting_queue')

    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
    )
    // A guarda que impede sobrescrever a hora da PRIMEIRA chamada quando duas
    // recepcionistas clicam quase junto.
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['status', 'waiting'] }),
    )
  })

  it('fila que já andou vira invalid-transition, não sucesso', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({ queue: null })

    await expect(
      new SupabaseEncounterRepository(fake.client).call(CLINIC, QUEUE_ENTRY),
    ).rejects.toMatchObject({ reason: 'invalid-transition' })

    spy.mockRestore()
  })
})

describe('start — nasce o encounter', () => {
  it('atualiza a fila ANTES de criar o atendimento', async () => {
    const fake = createFakeClient({})

    await new SupabaseEncounterRepository(fake.client).start(
      CLINIC,
      QUEUE_ENTRY,
      PROFESSIONAL,
      USER,
    )

    const firstQueueCall = fake.calls.findIndex(
      (call) => call.table === 'waiting_queue',
    )
    const firstEncounterCall = fake.calls.findIndex(
      (call) => call.table === 'encounters',
    )

    /*
     * A ordem e a corrida: a fila carrega a condicao (`status in waiting,
     * called`), entao e ela que decide se esta chamada tem direito de iniciar.
     * Criar o encounter antes deixaria um atendimento orfao quando duas telas
     * competissem.
     */
    expect(firstQueueCall).toBeLessThan(firstEncounterCall)
  })

  it('aceita iniciar a partir de aguardando OU chamado', async () => {
    const fake = createFakeClient({})

    await new SupabaseEncounterRepository(fake.client).start(
      CLINIC,
      QUEUE_ENTRY,
      PROFESSIONAL,
      USER,
    )

    expect(fake.ofTable('waiting_queue')).toContainEqual(
      expect.objectContaining({
        method: 'in',
        args: ['status', ['waiting', 'called']],
      }),
    )
  })

  it('falha ao criar o encounter devolve a fila ao estado anterior', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({
      encounter: null,
      encounterError: { code: '23503', message: 'fk violation' },
    })

    await expect(
      new SupabaseEncounterRepository(fake.client).start(
        CLINIC,
        QUEUE_ENTRY,
        PROFESSIONAL,
        USER,
      ),
    ).rejects.toMatchObject({ reason: 'not-found' })

    // Sem isto a pessoa ficaria presa em "em atendimento" sem atendimento
    // nenhum por tras. Nao ha transacao: o PostgREST nao a expoe.
    const rollback = fake
      .ofTable('waiting_queue')
      .filter((call) => call.method === 'update')
      .map((call) => call.args[0] as Record<string, unknown>)

    expect(rollback.at(-1)).toMatchObject({ status: 'called', started_at: null })

    spy.mockRestore()
  })
})

describe('close', () => {
  it('encerra só o que está aberto, e não apaga', async () => {
    const fake = createFakeClient({
      encounter: encounterRow({
        status: 'closed',
        ended_at: '2026-08-07T12:40:00.000Z',
      }),
    })

    await new SupabaseEncounterRepository(fake.client).close(
      CLINIC,
      ENCOUNTER,
    )

    const calls = fake.ofTable('encounters')

    expect(calls.some((call) => call.method === 'delete')).toBe(false)
    // Encerrar duas vezes sobrescreveria `ended_at` e faria o atendimento
    // parecer mais curto do que foi.
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['status', 'open'] }),
    )

    const update = calls.find((call) => call.method === 'update')
      ?.args[0] as Record<string, unknown>

    expect(update.status).toBe('closed')
    expect(update.ended_at).toBeTypeOf('string')
  })

  it('libera a fila depois de encerrar', async () => {
    const fake = createFakeClient({
      encounter: encounterRow({ status: 'closed' }),
    })

    await new SupabaseEncounterRepository(fake.client).close(
      CLINIC,
      ENCOUNTER,
    )

    const queueUpdate = fake
      .ofTable('waiting_queue')
      .find((call) => call.method === 'update')?.args[0] as Record<
      string,
      unknown
    >

    expect(queueUpdate.status).toBe('done')
    expect(queueUpdate.finished_at).toBeTypeOf('string')
  })

  it('encerrar o que já fechou vira invalid-transition', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({ encounter: null })

    await expect(
      new SupabaseEncounterRepository(fake.client).close(CLINIC, ENCOUNTER),
    ).rejects.toMatchObject({ reason: 'invalid-transition' })

    spy.mockRestore()
  })
})

describe('leitura', () => {
  it('ordena a fila por prioridade e depois por chegada', async () => {
    const fake = createFakeClient({})

    await new SupabaseEncounterRepository(fake.client).listQueue(
      CLINIC,
      new Date('2026-08-07T15:00:00.000Z'),
    )

    const orders = fake
      .ofTable('waiting_queue')
      .filter((call) => call.method === 'order')
      .map((call) => call.args[0])

    // E a ordem que a recepcao anuncia em voz alta: trocar faria a fila da tela
    // discordar da fila da sala de espera.
    expect(orders).toEqual(['priority', 'arrived_at'])
  })

  it('filtra sempre pela clínica ativa', async () => {
    const fake = createFakeClient({})

    await new SupabaseEncounterRepository(fake.client).listEncounters(
      CLINIC,
      new Date('2026-08-07T15:00:00.000Z'),
    )

    expect(fake.ofTable('encounters')).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
    )
  })
})
