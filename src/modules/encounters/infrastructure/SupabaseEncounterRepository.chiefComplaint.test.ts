import { describe, expect, it, vi } from 'vitest'

import { SupabaseEncounterRepository } from './SupabaseEncounterRepository'

/**
 * Queixa principal no adapter — feature **E-03**.
 *
 * Fake próprio, e não o de `SupabaseEncounterRepository.test.ts`: aquele resolve
 * as leituras da fila por heurística de tabela, e o que interessa aqui é outra
 * coisa — a condição `status = 'open'` no `WHERE` e as três causas de zero
 * linhas.
 *
 * **Nenhuma chamada de rede.**
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const ENCOUNTER = '9019956f-bdd8-4d61-868d-09b02332dad0'

interface RecordedCall {
  query: number
  table: string
  method: string
  args: unknown[]
}

function encounterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ENCOUNTER,
    patient_id: '11111111-1111-4111-8111-111111111111',
    professional_id: '22222222-2222-4222-8222-222222222222',
    appointment_id: null,
    status: 'open',
    chief_complaint: 'Dor torácica há 2 dias',
    started_at: '2026-08-10T13:00:00.000Z',
    ended_at: null,
    patients: { full_name: 'Marina Costa' },
    professionals: { display_name: 'Dra. Helena' },
    ...overrides,
  }
}

interface FakeOptions {
  /** Linha devolvida pelo UPDATE. `null` = zero linhas alcançadas. */
  updated?: unknown
  /** Releitura depois de zero linhas. `null` = o atendimento sumiu. */
  existing?: { status: string } | null
  error?: { code?: string | null; message?: string | null }
}

function createFake(options: FakeOptions = {}) {
  const calls: RecordedCall[] = []
  let queryIndex = -1

  const from = vi.fn((table: string) => {
    queryIndex += 1
    const index = queryIndex
    const query: Record<string, unknown> = {}

    const argsOf = (method: string) =>
      calls.find((call) => call.query === index && call.method === method)?.args

    for (const method of ['select', 'eq', 'update']) {
      query[method] = (...args: unknown[]) => {
        calls.push({ query: index, table, method, args })
        return query
      }
    }

    query.maybeSingle = async () => {
      calls.push({ query: index, table, method: 'maybeSingle', args: [] })

      if (options.error) return { data: null, error: options.error }

      // A releitura de diagnóstico pede só o status.
      if (argsOf('select')?.[0] === 'status') {
        return { data: 'existing' in options ? options.existing : null, error: null }
      }

      return {
        data: 'updated' in options ? options.updated : encounterRow(),
        error: null,
      }
    }

    return query
  })

  return {
    calls,
    argsOf: (method: string) =>
      calls.filter((call) => call.method === method).map((call) => call.args),
    subject: new SupabaseEncounterRepository({ from } as never),
  }
}

describe('escrita', () => {
  it('só alcança atendimento ABERTO', async () => {
    /*
     * A condição vai no `WHERE`, não numa leitura anterior: entre a tela
     * carregar e o clique chegar, outra pessoa pode ter encerrado o
     * atendimento. Gravar por cima mudaria a justificativa de uma conduta já
     * tomada.
     */
    const fake = createFake()

    await fake.subject.setChiefComplaint(CLINIC, ENCOUNTER, 'Cefaleia')

    expect(fake.argsOf('eq')).toContainEqual(['status', 'open'])
  })

  it('é escopada em clínica E id', async () => {
    const fake = createFake()

    await fake.subject.setChiefComplaint(CLINIC, ENCOUNTER, 'Cefaleia')

    expect(fake.argsOf('eq')).toContainEqual(['clinic_id', CLINIC])
    expect(fake.argsOf('eq')).toContainEqual(['id', ENCOUNTER])
  })

  it('grava só a queixa e o carimbo de tempo', async () => {
    // Reaproveitar um payload maior aqui apagaria `ended_at` ou `status` de um
    // atendimento em curso.
    const fake = createFake()

    await fake.subject.setChiefComplaint(CLINIC, ENCOUNTER, 'Cefaleia')

    const patch = fake.argsOf('update')[0][0] as Record<string, unknown>
    expect(patch.chief_complaint).toBe('Cefaleia')
    expect(Object.keys(patch).sort()).toEqual(['chief_complaint', 'updated_at'])
  })

  it('null apaga a queixa', async () => {
    const fake = createFake({ updated: encounterRow({ chief_complaint: null }) })

    const encounter = await fake.subject.setChiefComplaint(CLINIC, ENCOUNTER, null)

    expect((fake.argsOf('update')[0][0] as Record<string, unknown>).chief_complaint)
      .toBeNull()
    expect(encounter.chiefComplaint).toBeNull()
  })

  it('a queixa volta na entidade', async () => {
    const fake = createFake()

    const encounter = await fake.subject.setChiefComplaint(
      CLINIC,
      ENCOUNTER,
      'Dor torácica há 2 dias',
    )

    expect(encounter.chiefComplaint).toBe('Dor torácica há 2 dias')
  })
})

/**
 * Zero linhas tem três causas, e elas pedem coisas diferentes de quem clicou.
 */
describe('zero linhas alcançadas', () => {
  it('atendimento encerrado é `invalid-transition`', async () => {
    /*
     * E não `not-found`: o atendimento está lá, e a pessoa precisa saber que a
     * janela clínica fechou — não procurar um registro que não sumiu.
     */
    const fake = createFake({ updated: null, existing: { status: 'closed' } })

    await expect(
      fake.subject.setChiefComplaint(CLINIC, ENCOUNTER, 'Cefaleia'),
    ).rejects.toMatchObject({ reason: 'invalid-transition' })
  })

  it('atendimento ausente é `not-found`', async () => {
    const fake = createFake({ updated: null, existing: null })

    await expect(
      fake.subject.setChiefComplaint(CLINIC, ENCOUNTER, 'Cefaleia'),
    ).rejects.toMatchObject({ reason: 'not-found' })
  })

  it('aberto e legível é recusa de ESCRITA', async () => {
    /*
     * Sem policy de UPDATE o Postgres não devolve erro: a linha não é alcançada
     * e nada muda, em silêncio.
     */
    const fake = createFake({ updated: null, existing: { status: 'open' } })

    await expect(
      fake.subject.setChiefComplaint(CLINIC, ENCOUNTER, 'Cefaleia'),
    ).rejects.toMatchObject({ reason: 'forbidden' })
  })

  it('recusa da policy no próprio UPDATE vira forbidden', async () => {
    const fake = createFake({ error: { code: '42501', message: 'denied' } })

    await expect(
      fake.subject.setChiefComplaint(CLINIC, ENCOUNTER, 'Cefaleia'),
    ).rejects.toMatchObject({ reason: 'forbidden' })
  })
})
