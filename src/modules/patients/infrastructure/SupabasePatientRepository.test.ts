import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PatientListQuery } from '../domain/PatientRepository'
import { PATIENT_PAGE_MAX_SIZE } from '../schemas/patientQuery.schema'
import {
  encodePatientCursor,
  patientQueryFingerprint,
} from './patientCursor'
import { SupabasePatientRepository } from './SupabasePatientRepository'

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const ANCHOR_ID = '9019956f-bdd8-4d61-868d-09b02332dad0'
const OTHER_TENANT_ID = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'

interface RecordedCall {
  /** Indice do `from()` que originou a chamada — separa ancora de listagem. */
  query: number
  table: string
  method: string
  args: unknown[]
}

interface FakeResult {
  data?: unknown
  count?: number | null
  error?: { code?: string; message?: string } | null
}

/**
 * Cliente falso do supabase-js.
 *
 * Grava a cadeia de chamadas em vez de falar com o banco: e o unico jeito de
 * afirmar que `clinic_id` e `deleted_at is null` estao em TODAS as consultas —
 * inclusive na resolucao da ancora, que e a superficie nova de P-02a.
 *
 * Nenhuma chamada de rede acontece aqui. Tenancy real continua sendo pgTAP (R1).
 */
function createFakeClient(results: {
  /** Resultado do `.maybeSingle()` — a consulta da ancora. */
  anchor?: FakeResult
  /** Resultado do `await` na consulta de `patients`. */
  patients?: FakeResult
  appointments?: FakeResult
}) {
  const calls: RecordedCall[] = []
  let queryIndex = -1

  const chainable = [
    'select',
    'eq',
    'is',
    'or',
    'not',
    'in',
    'gte',
    'order',
    'limit',
  ] as const

  const from = vi.fn((table: string) => {
    queryIndex += 1
    const index = queryIndex

    const query: Record<string, unknown> = {}

    for (const method of chainable) {
      query[method] = (...args: unknown[]) => {
        calls.push({ query: index, table, method, args })
        return query
      }
    }

    query.maybeSingle = async () => {
      calls.push({ query: index, table, method: 'maybeSingle', args: [] })
      return results.anchor ?? { data: null, error: null }
    }

    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      const result =
        table === 'appointments'
          ? (results.appointments ?? { data: [], error: null })
          : (results.patients ?? { data: [], error: null })

      return Promise.resolve({
        data: result.data ?? [],
        count: result.count ?? null,
        error: result.error ?? null,
      }).then(onFulfilled, onRejected)
    }

    return query
  })

  return {
    calls,
    client: { from } as never,
    /** Chamadas do N-esimo `from()`, na ordem em que aconteceram. */
    ofQuery: (index: number) => calls.filter((call) => call.query === index),
  }
}

function row(id: string, fullName: string) {
  return {
    id,
    full_name: fullName,
    birth_date: null,
    phone: null,
    email: null,
    is_active: true,
    created_at: '2026-08-07T12:00:00.000Z',
  }
}

function query(overrides: Partial<PatientListQuery> = {}): PatientListQuery {
  return { search: null, status: 'all', limit: 20, cursor: null, ...overrides }
}

// ---------------------------------------------------------------------------

describe('SupabasePatientRepository.listPage — recorte e tenancy', () => {
  it('filtra clinica e exclusao logica, ordena de forma estavel e pede limit + 1', async () => {
    const fake = createFakeClient({
      patients: { data: [row(ANCHOR_ID, 'Ana'), row(OTHER_TENANT_ID, 'Bruno')] },
    })

    const page = await new SupabasePatientRepository(fake.client).listPage(
      CLINIC,
      query({ limit: 20 }),
    )

    const list = fake.ofQuery(0)

    expect(list).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
    )
    expect(list).toContainEqual(
      expect.objectContaining({ method: 'is', args: ['deleted_at', null] }),
    )

    // Desempate por id: sem ele, homonimos repetem ou somem entre paginas.
    expect(list).toContainEqual(
      expect.objectContaining({
        method: 'order',
        args: ['full_name', { ascending: true }],
      }),
    )
    expect(list).toContainEqual(
      expect.objectContaining({
        method: 'order',
        args: ['id', { ascending: true }],
      }),
    )

    // limit + 1 e o que responde "ha proxima pagina?" sem um count por pagina.
    expect(list).toContainEqual(
      expect.objectContaining({ method: 'limit', args: [21] }),
    )

    expect(page.items).toHaveLength(2)
    expect(page.hasMore).toBe(false)
    expect(page.nextCursor).toBeNull()
  })

  it('nao leva coluna sensivel para o cliente', async () => {
    const fake = createFakeClient({ patients: { data: [] } })

    await new SupabasePatientRepository(fake.client).listPage(CLINIC, query())

    const select = fake
      .ofQuery(0)
      .find((call) => call.method === 'select')?.args[0] as string

    for (const column of [
      'cpf',
      'cns',
      'admin_notes',
      'address',
      'clinic_id',
      'photo_url',
    ]) {
      expect(select).not.toContain(column)
    }

    expect(select).toContain('full_name')
  })

  it('clampa o limite mesmo quando a porta e chamada fora de uma URL validada', async () => {
    const fake = createFakeClient({ patients: { data: [] } })

    await new SupabasePatientRepository(fake.client).listPage(
      CLINIC,
      query({ limit: 1000 }),
    )

    expect(fake.ofQuery(0)).toContainEqual(
      expect.objectContaining({
        method: 'limit',
        args: [PATIENT_PAGE_MAX_SIZE + 1],
      }),
    )
  })

  it('corta a linha sobressalente e emite cursor quando ha proxima pagina', async () => {
    const fake = createFakeClient({
      patients: {
        data: [
          row(ANCHOR_ID, 'Ana'),
          row(OTHER_TENANT_ID, 'Bruno'),
          row('11111111-1111-4111-8111-111111111111', 'Carla'),
        ],
      },
    })

    const page = await new SupabasePatientRepository(fake.client).listPage(
      CLINIC,
      query({ limit: 2 }),
    )

    expect(page.items.map((item) => item.name)).toEqual(['Ana', 'Bruno'])
    expect(page.hasMore).toBe(true)
    expect(page.nextCursor).not.toBeNull()
  })

  it('busca visitas apenas dos ids DA PAGINA', async () => {
    const fake = createFakeClient({
      patients: {
        data: [
          row(ANCHOR_ID, 'Ana'),
          row(OTHER_TENANT_ID, 'Bruno'),
          row('11111111-1111-4111-8111-111111111111', 'Carla'),
        ],
      },
    })

    await new SupabasePatientRepository(fake.client).listPage(
      CLINIC,
      query({ limit: 2 }),
    )

    // Antes de P-02a isto recebia a clinica inteira e a URL do PostgREST
    // estourava em HTTP 414 com algumas centenas de pacientes.
    const inCall = fake.calls.find(
      (call) => call.table === 'appointments' && call.method === 'in',
    )

    expect(inCall?.args).toEqual(['patient_id', [ANCHOR_ID, OTHER_TENANT_ID]])
  })

  it('aplica o status no servidor', async () => {
    const active = createFakeClient({ patients: { data: [] } })
    await new SupabasePatientRepository(active.client).listPage(
      CLINIC,
      query({ status: 'active' }),
    )
    expect(active.ofQuery(0)).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['is_active', true] }),
    )

    const inactive = createFakeClient({ patients: { data: [] } })
    await new SupabasePatientRepository(inactive.client).listPage(
      CLINIC,
      query({ status: 'inactive' }),
    )
    expect(inactive.ofQuery(0)).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['is_active', false] }),
    )

    const all = createFakeClient({ patients: { data: [] } })
    await new SupabasePatientRepository(all.client).listPage(CLINIC, query())
    expect(
      all.ofQuery(0).filter((call) => call.args[0] === 'is_active'),
    ).toHaveLength(0)
  })

  it('aplica a busca no servidor, sanitizada', async () => {
    const fake = createFakeClient({ patients: { data: [] } })

    await new SupabasePatientRepository(fake.client).listPage(
      CLINIC,
      query({ search: 'ana",is_active.eq.false' }),
    )

    const orCalls = fake
      .ofQuery(0)
      .filter((call) => call.method === 'or')
      .map((call) => call.args[0] as string)

    expect(orCalls).toHaveLength(1)
    expect(orCalls[0]).not.toContain('is_active')
    expect(orCalls[0]).toContain('full_name.ilike.')
  })
})

describe('SupabasePatientRepository.listPage — cursor', () => {
  it('resolve a ancora filtrando clinica e exclusao logica', async () => {
    const fingerprint = patientQueryFingerprint({ search: null, status: 'all' })
    const fake = createFakeClient({
      anchor: { data: { id: ANCHOR_ID, full_name: 'Maria Silva' } },
      patients: { data: [] },
    })

    const page = await new SupabasePatientRepository(fake.client).listPage(
      CLINIC,
      query({ cursor: encodePatientCursor(ANCHOR_ID, fingerprint) }),
    )

    // A ancora e a superficie NOVA de P-02a: se algum filtro de tenant faltar
    // aqui, o cursor vira um seletor de linha de qualquer clinica.
    const anchorQuery = fake.ofQuery(0)
    expect(anchorQuery).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
    )
    expect(anchorQuery).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['id', ANCHOR_ID] }),
    )
    expect(anchorQuery).toContainEqual(
      expect.objectContaining({ method: 'is', args: ['deleted_at', null] }),
    )

    const keyset = fake
      .ofQuery(1)
      .filter((call) => call.method === 'or')
      .map((call) => call.args[0] as string)

    expect(keyset).toHaveLength(1)
    expect(keyset[0]).toBe(
      `full_name.gt."Maria Silva",and(full_name.eq."Maria Silva",id.gt.${ANCHOR_ID})`,
    )
    expect(page.cursorApplied).toBe(true)
  })

  it('ancora de outra clinica cai na primeira pagina do proprio tenant', async () => {
    const fingerprint = patientQueryFingerprint({ search: null, status: 'all' })
    // A consulta da ancora nao acha linha: filtro explicito + RLS.
    const fake = createFakeClient({
      anchor: { data: null },
      patients: { data: [row(ANCHOR_ID, 'Ana')] },
    })

    const page = await new SupabasePatientRepository(fake.client).listPage(
      CLINIC,
      query({ cursor: encodePatientCursor(OTHER_TENANT_ID, fingerprint) }),
    )

    expect(page.cursorApplied).toBe(false)
    expect(page.items.map((item) => item.name)).toEqual(['Ana'])
    expect(
      fake.ofQuery(1).filter((call) => call.method === 'or'),
    ).toHaveLength(0)
  })

  it('cursor corrompido nao consulta ancora e nao lanca', async () => {
    const fake = createFakeClient({ patients: { data: [] } })

    const page = await new SupabasePatientRepository(fake.client).listPage(
      CLINIC,
      query({ cursor: 'lixo!!!' }),
    )

    expect(page.cursorApplied).toBe(false)
    expect(fake.calls.some((call) => call.method === 'maybeSingle')).toBe(false)
  })

  it('cursor de outro recorte de filtro e ignorado', async () => {
    // Fingerprint da busca "ana" aplicado a busca "bruno": aceitar isso
    // devolveria uma pagina plausivel comecando no meio.
    const fake = createFakeClient({
      anchor: { data: { id: ANCHOR_ID, full_name: 'Ana' } },
      patients: { data: [] },
    })

    const page = await new SupabasePatientRepository(fake.client).listPage(
      CLINIC,
      query({
        search: 'bruno',
        cursor: encodePatientCursor(
          ANCHOR_ID,
          patientQueryFingerprint({ search: 'ana', status: 'all' }),
        ),
      }),
    )

    expect(page.cursorApplied).toBe(false)
    expect(fake.calls.some((call) => call.method === 'maybeSingle')).toBe(false)
  })

  it('falha ao resolver a ancora serve a primeira pagina, nao um erro', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fingerprint = patientQueryFingerprint({ search: null, status: 'all' })
    const fake = createFakeClient({
      anchor: { data: null, error: { code: '08006', message: 'connection lost' } },
      patients: { data: [row(ANCHOR_ID, 'Ana')] },
    })

    const page = await new SupabasePatientRepository(fake.client).listPage(
      CLINIC,
      query({ cursor: encodePatientCursor(ANCHOR_ID, fingerprint) }),
    )

    expect(page.cursorApplied).toBe(false)
    expect(page.items).toHaveLength(1)
    spy.mockRestore()
  })
})

describe('SupabasePatientRepository — erro de leitura', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('nao deixa a mensagem do Postgres subir para a tela', async () => {
    const fake = createFakeClient({
      patients: {
        data: null,
        error: {
          code: '42501',
          message: 'permission denied for relation patients',
        },
      },
    })

    await expect(
      new SupabasePatientRepository(fake.client).listPage(CLINIC, query()),
    ).rejects.toThrow(/Falha ao carregar os dados de pacientes/)

    await expect(
      new SupabasePatientRepository(fake.client).listPage(CLINIC, query()),
    ).rejects.not.toThrow(/permission denied/)

    // A causa nao some: vai para o log do servidor, com SQLSTATE.
    expect(errorSpy).toHaveBeenCalledWith(
      '[patients] listPage',
      expect.objectContaining({ code: '42501' }),
    )

    errorSpy.mockRestore()
  })
})

describe('SupabasePatientRepository.countMetrics', () => {
  it('conta sem transferir linha, e sem derivar da pagina', async () => {
    const fake = createFakeClient({
      patients: { count: 1284 },
      appointments: { count: 18 },
    })

    const metrics = await new SupabasePatientRepository(
      fake.client,
    ).countMetrics(CLINIC, new Date(2026, 7, 7))

    expect(metrics).toEqual({
      total: 1284,
      newThisMonth: 1284,
      pendingAppointments: 18,
    })

    const heads = fake.calls.filter((call) => call.method === 'select')
    expect(heads).toHaveLength(3)
    for (const head of heads) {
      expect(head.args[1]).toEqual({ count: 'exact', head: true })
    }

    // "Novos este mes" recorta pelo primeiro dia do mes de referencia.
    const monthStart = fake.calls.find((call) => call.method === 'gte')
    expect(monthStart?.args[0]).toBe('created_at')
    expect(String(monthStart?.args[1])).toContain('2026-08-01')
  })

  it('conta atendimentos futuros nao cancelados', async () => {
    const fake = createFakeClient({
      patients: { count: 0 },
      appointments: { count: 3 },
    })

    await new SupabasePatientRepository(fake.client).countMetrics(
      CLINIC,
      new Date(2026, 7, 7),
    )

    const appointmentCalls = fake.calls.filter(
      (call) => call.table === 'appointments',
    )

    expect(appointmentCalls).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
    )
    expect(appointmentCalls).toContainEqual(
      expect.objectContaining({
        method: 'not',
        args: ['status', 'in', '("canceled","no_show")'],
      }),
    )
  })
})

// ---------------------------------------------------------------------------

function createUpdateClient() {
  const calls: Array<[string, ...unknown[]]> = []
  const query = {
    update(payload: unknown) {
      calls.push(['update', payload])
      return query
    },
    eq(column: string, value: unknown) {
      calls.push(['eq', column, value])
      return query
    },
    is(column: string, value: unknown) {
      calls.push(['is', column, value])
      return query
    },
    select(columns: string) {
      calls.push(['select', columns])
      return query
    },
    async maybeSingle() {
      return { data: null, error: null }
    },
  }

  return {
    calls,
    client: {
      from: vi.fn(() => query),
    },
  }
}

describe('SupabasePatientRepository — isolamento do tenant', () => {
  it('não trata paciente de outra clínica como atualização bem-sucedida', async () => {
    const { client, calls } = createUpdateClient()
    const repository = new SupabasePatientRepository(client as never)

    await expect(
      repository.update(
        'clinic-owner',
        '9019956f-bdd8-4d61-868d-09b02332dad0',
        {
          fullName: 'Paciente atualizado',
          birthDate: null,
          phone: null,
          email: null,
          adminNotes: null,
        },
      ),
    ).rejects.toMatchObject({ reason: 'not-found' })

    expect(calls).toContainEqual(['eq', 'clinic_id', 'clinic-owner'])
    expect(calls).toContainEqual([
      'eq',
      'id',
      '9019956f-bdd8-4d61-868d-09b02332dad0',
    ])
    expect(calls).toContainEqual(['is', 'deleted_at', null])
  })
})
