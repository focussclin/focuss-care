import { describe, expect, it, vi } from 'vitest'

import { SupabaseAppointmentRepository } from './SupabaseAppointmentRepository'

/**
 * Transições de estado do atendimento — feature **A-03**.
 *
 * Fake próprio, e não o de `SupabaseAppointmentRepository.test.ts`: aquele
 * resolve `maybeSingle` pelo argumento do `select`, e a leitura desta fatia pede
 * `status, starts_at`. Emendar os dois faria um harness que decide por
 * heurística sobre heurística — e o que interessa aqui é outra coisa: a
 * condição de origem no `WHERE` e as três causas de zero linhas.
 *
 * **Nenhuma chamada de rede.**
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const APPOINTMENT = '9019956f-bdd8-4d61-868d-09b02332dad0'

const PAST = '2026-08-10T13:00:00.000Z'
const FUTURE = '2099-01-01T13:00:00.000Z'

interface RecordedCall {
  query: number
  table: string
  method: string
  args: unknown[]
}

function joinRow(overrides: Record<string, unknown> = {}) {
  return {
    id: APPOINTMENT,
    patient_id: '11111111-1111-4111-8111-111111111111',
    professional_id: '22222222-2222-4222-8222-222222222222',
    reason: 'Consulta de rotina',
    starts_at: PAST,
    ends_at: '2026-08-10T13:30:00.000Z',
    status: 'confirmed',
    internal_notes: null,
    patients: { full_name: 'Marina Costa' },
    professionals: { display_name: 'Dra. Helena' },
    ...overrides,
  }
}

interface FakeOptions {
  /** Linha lida antes da escrita: status atual e horário marcado. */
  current?: { status: string; starts_at: string } | null
  /** Linha devolvida pelo UPDATE. `null` = zero linhas alcançadas. */
  updated?: unknown
  /** Releitura depois de zero linhas. `null` = o atendimento sumiu. */
  existing?: { status: string } | null
}

function createFake(options: FakeOptions = {}) {
  const calls: RecordedCall[] = []
  let queryIndex = -1
  let updateSeen = false

  const from = vi.fn((table: string) => {
    queryIndex += 1
    const index = queryIndex
    const query: Record<string, unknown> = {}

    const argsOf = (method: string) =>
      calls.find((call) => call.query === index && call.method === method)?.args

    for (const method of ['select', 'eq', 'in', 'update', 'insert']) {
      query[method] = (...args: unknown[]) => {
        calls.push({ query: index, table, method, args })
        if (method === 'update') updateSeen = true
        return query
      }
    }

    query.maybeSingle = async () => {
      calls.push({ query: index, table, method: 'maybeSingle', args: [] })

      // A leitura de contexto, antes da escrita.
      if (argsOf('select')?.[0] === 'status, starts_at') {
        return {
          data:
            'current' in options
              ? options.current
              : { status: 'confirmed', starts_at: PAST },
          error: null,
        }
      }

      // A releitura de diagnóstico, depois de zero linhas.
      if (argsOf('select')?.[0] === 'status') {
        return { data: 'existing' in options ? options.existing : null, error: null }
      }

      // O retorno do próprio UPDATE.
      return {
        data: 'updated' in options ? options.updated : joinRow(),
        error: null,
      }
    }

    // `appointment_status_history` é insert solto, sem `select`.
    query.then = (onFulfilled: (value: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(onFulfilled)

    return query
  })

  return {
    calls,
    updateHappened: () => updateSeen,
    argsOf: (method: string) =>
      calls.filter((call) => call.method === method).map((call) => call.args),
    ofTable: (table: string) => calls.filter((call) => call.table === table),
    subject: new SupabaseAppointmentRepository({ from } as never),
  }
}

describe('confirmar', () => {
  it('só alcança atendimento em `scheduled`', async () => {
    /*
     * A condição vai no `WHERE`, não numa leitura anterior: entre ler o status e
     * gravar o novo cabe o clique de outra pessoa. É isto que faz a segunda
     * escrita alcançar zero linhas em vez de sobrescrever a primeira.
     */
    const fake = createFake({ current: { status: 'scheduled', starts_at: PAST } })

    await fake.subject.confirm(CLINIC, APPOINTMENT, USER)

    expect(fake.argsOf('in')).toContainEqual(['status', ['scheduled']])
  })

  it('carimba `confirmed_at`', async () => {
    // A coluna existia desde o princípio e nunca era escrita.
    const fake = createFake({ current: { status: 'scheduled', starts_at: PAST } })

    await fake.subject.confirm(CLINIC, APPOINTMENT, USER)

    const patch = fake.argsOf('update')[0][0] as Record<string, unknown>
    expect(patch.status).toBe('confirmed')
    expect(typeof patch.confirmed_at).toBe('string')
  })

  it('é escopado em clínica E id', async () => {
    const fake = createFake({ current: { status: 'scheduled', starts_at: PAST } })

    await fake.subject.confirm(CLINIC, APPOINTMENT, USER)

    expect(fake.argsOf('eq')).toContainEqual(['clinic_id', CLINIC])
    expect(fake.argsOf('eq')).toContainEqual(['id', APPOINTMENT])
  })
})

describe('desfecho', () => {
  it('aceita as quatro origens anteriores ao fim', async () => {
    const fake = createFake()

    await fake.subject.recordOutcome(CLINIC, APPOINTMENT, 'no_show', USER)

    expect(fake.argsOf('in')).toContainEqual([
      'status',
      ['scheduled', 'confirmed', 'checked_in', 'in_progress'],
    ])
  })

  it('não mexe em `confirmed_at`', async () => {
    // Registrar comparecimento não é confirmar; carimbar aqui inventaria uma
    // confirmação que ninguém deu.
    const fake = createFake()

    await fake.subject.recordOutcome(CLINIC, APPOINTMENT, 'completed', USER)

    const patch = fake.argsOf('update')[0][0] as Record<string, unknown>
    expect(patch.status).toBe('completed')
    expect(patch).not.toHaveProperty('confirmed_at')
  })

  it('antes do horário marcado, recusa SEM escrever', async () => {
    /*
     * Falta anotada na véspera entraria na taxa de comparecimento como fato
     * observado. A recusa acontece antes do `update` — não adianta gravar e
     * desfazer.
     */
    const fake = createFake({ current: { status: 'confirmed', starts_at: FUTURE } })

    await expect(
      fake.subject.recordOutcome(CLINIC, APPOINTMENT, 'no_show', USER),
    ).rejects.toMatchObject({ reason: 'outcome-too-early' })

    expect(fake.updateHappened()).toBe(false)
  })

  it('a regra de horário NÃO vale para confirmar', async () => {
    // Confirmar na véspera é exatamente a rotina; é o desfecho que exige a hora.
    const fake = createFake({ current: { status: 'scheduled', starts_at: FUTURE } })

    await expect(
      fake.subject.confirm(CLINIC, APPOINTMENT, USER),
    ).resolves.toMatchObject({ id: APPOINTMENT })
  })
})

/**
 * Zero linhas tem três causas, e elas pedem coisas diferentes de quem clicou.
 */
describe('zero linhas alcançadas', () => {
  it('atendimento em outro estado vira `stale-status`, com o estado atual', async () => {
    const fake = createFake({
      current: { status: 'scheduled', starts_at: PAST },
      updated: null,
      existing: { status: 'canceled' },
    })

    await expect(
      fake.subject.confirm(CLINIC, APPOINTMENT, USER),
    ).rejects.toMatchObject({ reason: 'stale-status', currentStatus: 'canceled' })
  })

  it('atendimento ausente vira `not-found`', async () => {
    const fake = createFake({
      current: { status: 'scheduled', starts_at: PAST },
      updated: null,
      existing: null,
    })

    await expect(
      fake.subject.confirm(CLINIC, APPOINTMENT, USER),
    ).rejects.toMatchObject({ reason: 'not-found' })
  })

  it('legível e em estado permitido é recusa de ESCRITA', async () => {
    /*
     * Sem policy de UPDATE o Postgres não devolve erro: a linha não é alcançada
     * e zero linhas mudam, em silêncio. Chamar isso de `not-found` faria a
     * recepção procurar um atendimento que está lá.
     */
    const fake = createFake({
      current: { status: 'scheduled', starts_at: PAST },
      updated: null,
      existing: { status: 'scheduled' },
    })

    await expect(
      fake.subject.confirm(CLINIC, APPOINTMENT, USER),
    ).rejects.toMatchObject({ reason: 'forbidden' })
  })
})

describe('trilha operacional', () => {
  it('grava de onde veio e para onde foi', async () => {
    /*
     * O status anterior é lido ANTES do update: depois dele a informação some, e
     * é ela que o histórico precisa para dizer de onde a linha veio.
     */
    const fake = createFake({ current: { status: 'confirmed', starts_at: PAST } })

    await fake.subject.recordOutcome(CLINIC, APPOINTMENT, 'no_show', USER)

    const history = fake.ofTable('appointment_status_history')
    const payload = history.find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    expect(payload).toMatchObject({
      clinic_id: CLINIC,
      appointment_id: APPOINTMENT,
      from_status: 'confirmed',
      to_status: 'no_show',
      changed_by: USER,
    })
  })
})

/**
 * A fila carimba a agenda — feature **A-04**.
 *
 * Os dois estados existiam no enum e eram inalcançáveis. O que se prova aqui é
 * que eles passam pelo MESMO caminho das outras transições: condição de origem
 * no `WHERE`, escopo de clínica e trilha operacional.
 */
describe('andamento vindo da fila', () => {
  it('a chegada só alcança o que ainda não começou', async () => {
    const fake = createFake({ current: { status: 'scheduled', starts_at: PAST } })

    await fake.subject.markProgress(CLINIC, APPOINTMENT, 'checked_in', USER)

    expect(fake.argsOf('in')).toContainEqual([
      'status',
      ['scheduled', 'confirmed'],
    ])
    const patch = fake.argsOf('update')[0][0] as Record<string, unknown>
    expect(patch.status).toBe('checked_in')
  })

  it('o início aceita partir de `scheduled`, sem passar pela chegada', async () => {
    /*
     * Auto-corretivo de propósito: exigir `checked_in` deixaria a agenda presa
     * em "Agendado" em todo atendimento anterior a esta fatia.
     */
    const fake = createFake({ current: { status: 'scheduled', starts_at: PAST } })

    await fake.subject.markProgress(CLINIC, APPOINTMENT, 'in_progress', USER)

    expect(fake.argsOf('in')).toContainEqual([
      'status',
      ['scheduled', 'confirmed', 'checked_in'],
    ])
  })

  it('não carimba `confirmed_at`: chegar não é confirmar', async () => {
    const fake = createFake({ current: { status: 'scheduled', starts_at: PAST } })

    await fake.subject.markProgress(CLINIC, APPOINTMENT, 'checked_in', USER)

    const patch = fake.argsOf('update')[0][0] as Record<string, unknown>
    expect(patch.confirmed_at).toBeUndefined()
  })

  it('aceita chegada ANTES do horário marcado', async () => {
    /*
     * `outcomeIsDue` vale para desfecho, que é afirmação sobre o que aconteceu.
     * Chegada é fato observado no balcão — e paciente adiantado chegou.
     */
    const fake = createFake({ current: { status: 'confirmed', starts_at: FUTURE } })

    await expect(
      fake.subject.markProgress(CLINIC, APPOINTMENT, 'checked_in', USER),
    ).resolves.toBeDefined()
  })

  it('é escopado em clínica E id', async () => {
    const fake = createFake({ current: { status: 'scheduled', starts_at: PAST } })

    await fake.subject.markProgress(CLINIC, APPOINTMENT, 'checked_in', USER)

    expect(fake.argsOf('eq')).toContainEqual(['clinic_id', CLINIC])
    expect(fake.argsOf('eq')).toContainEqual(['id', APPOINTMENT])
  })

  it('entra na trilha operacional como qualquer outra transição', async () => {
    const fake = createFake({ current: { status: 'confirmed', starts_at: PAST } })

    await fake.subject.markProgress(CLINIC, APPOINTMENT, 'checked_in', USER)

    const history = fake.ofTable('appointment_status_history')
    const payload = history.find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    expect(payload).toMatchObject({
      appointment_id: APPOINTMENT,
      from_status: 'confirmed',
      to_status: 'checked_in',
      changed_by: USER,
    })
  })
})

/**
 * `checked_in_at` era a última coluna de `appointments` sem escrita nenhuma.
 *
 * O STATUS já chegava a `checked_in` desde a sincronização com a fila; o carimbo
 * de quando a pessoa chegou continuava nulo — `status` respondia "chegou" e nada
 * respondia "a que horas".
 */
describe('carimbo da chegada', () => {
  it('a chegada grava `checked_in_at`', async () => {
    const fake = createFake({ current: { status: 'confirmed', starts_at: PAST } })

    await fake.subject.markProgress(CLINIC, APPOINTMENT, 'checked_in', USER)

    const patch = fake.argsOf('update')[0][0] as Record<string, unknown>
    expect(patch.status).toBe('checked_in')
    expect(typeof patch.checked_in_at).toBe('string')
  })

  it('o início do atendimento NÃO carimba de novo', async () => {
    /*
     * `in_progress` tem `waiting_queue.started_at`, gravado pelo módulo de
     * atendimento. Carimbar aqui criaria dois relógios para o mesmo instante, e
     * eles divergiriam.
     */
    const fake = createFake({ current: { status: 'checked_in', starts_at: PAST } })

    await fake.subject.markProgress(CLINIC, APPOINTMENT, 'in_progress', USER)

    const patch = fake.argsOf('update')[0][0] as Record<string, unknown>
    expect(patch.status).toBe('in_progress')
    expect(patch).not.toHaveProperty('checked_in_at')
  })

  it('o desfecho também não mexe no carimbo da chegada', async () => {
    const fake = createFake({ current: { status: 'checked_in', starts_at: PAST } })

    await fake.subject.recordOutcome(CLINIC, APPOINTMENT, 'completed', USER)

    expect(fake.argsOf('update')[0][0]).not.toHaveProperty('checked_in_at')
  })
})
