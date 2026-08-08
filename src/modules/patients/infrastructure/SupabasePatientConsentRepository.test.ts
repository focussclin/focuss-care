import { describe, expect, it, vi } from 'vitest'

import { SupabasePatientConsentRepository } from './SupabasePatientConsentRepository'

/**
 * Adapter de consentimentos (P-03) — recorte e tenancy.
 *
 * O cliente e falso e grava a cadeia de chamadas em vez de falar com o banco. E o
 * unico jeito de afirmar, sem rede, as tres coisas que este adapter existe para
 * garantir:
 *
 *  1. **Os tres filtros** (`clinic_id`, `subject_type`, `subject_id`) estao em
 *     TODA consulta — leitura, insercao e revogacao.
 *  2. **`ip`, `user_agent` e `clinic_id` nunca saem do banco.** A verificacao e no
 *     `select`, que e onde a decisao acontece.
 *  3. **Nenhuma chave de servico aparece no caminho.** O adapter so recebe o
 *     cliente que lhe deram.
 *
 * Nenhuma chamada de rede acontece aqui. Tenancy real continua sendo pgTAP (R1 do
 * roadmap) — nenhum teste em Node prova RLS.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const PATIENT = '9019956f-bdd8-4d61-868d-09b02332dad0'
const OTHER_TENANT_PATIENT = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'
const CONSENT = '11111111-1111-4111-8111-111111111111'

interface RecordedCall {
  table: string
  method: string
  args: unknown[]
}

interface FakeResult {
  data?: unknown
  error?: { code?: string; message?: string } | null
}

function createFakeClient(results: { rows?: FakeResult; single?: FakeResult } = {}) {
  const calls: RecordedCall[] = []

  const from = vi.fn((table: string) => {
    const query: Record<string, unknown> = {}

    for (const method of ['select', 'eq', 'is', 'order', 'insert', 'update']) {
      query[method] = (...args: unknown[]) => {
        calls.push({ table, method, args })
        return query
      }
    }

    query.single = async () => {
      calls.push({ table, method: 'single', args: [] })
      const result = results.single ?? { data: null, error: null }
      return { data: result.data ?? null, error: result.error ?? null }
    }

    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      const result = results.rows ?? { data: [], error: null }
      return Promise.resolve({
        data: result.data ?? [],
        error: result.error ?? null,
      }).then(onFulfilled, onRejected)
    }

    return query
  })

  return {
    calls,
    client: { from } as never,
    of: (method: string) => calls.filter((call) => call.method === method),
  }
}

function consentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONSENT,
    purpose: 'health_data_processing',
    document_version: '2026-08.v1',
    granted_at: '2026-08-07T12:00:00.000Z',
    revoked_at: null,
    ...overrides,
  }
}

/** Os tres filtros que fecham o tenant, na forma que o teste verifica. */
function expectTenantFilters(calls: RecordedCall[]) {
  expect(calls).toContainEqual(
    expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
  )
  expect(calls).toContainEqual(
    expect.objectContaining({ method: 'eq', args: ['subject_type', 'patient'] }),
  )
  expect(calls).toContainEqual(
    expect.objectContaining({ method: 'eq', args: ['subject_id', PATIENT] }),
  )
}

// ---------------------------------------------------------------------------

describe('listByPatient', () => {
  it('filtra clinica, tipo de sujeito e paciente', async () => {
    const fake = createFakeClient({ rows: { data: [consentRow()] } })

    const consents = await new SupabasePatientConsentRepository(
      fake.client,
    ).listByPatient(CLINIC, PATIENT)

    expectTenantFilters(fake.calls)
    expect(fake.calls).toContainEqual(
      expect.objectContaining({
        method: 'order',
        args: ['granted_at', { ascending: false }],
      }),
    )
    expect(consents).toHaveLength(1)
    expect(consents[0].purpose).toBe('health_data_processing')
    expect(consents[0].revokedAt).toBeNull()
  })

  it('nao seleciona ip, user_agent nem clinic_id', async () => {
    const fake = createFakeClient({ rows: { data: [] } })

    await new SupabasePatientConsentRepository(fake.client).listByPatient(
      CLINIC,
      PATIENT,
    )

    const select = fake.of('select')[0]?.args[0] as string

    for (const column of ['ip', 'user_agent', 'clinic_id', 'subject_id', 'subject_type']) {
      expect(select).not.toContain(column)
    }

    expect(select).toContain('purpose')
    expect(select).toContain('document_version')
    expect(select).toContain('granted_at')
    expect(select).toContain('revoked_at')
  })

  it('mapeia revogado para Date, e vigente para null', async () => {
    const fake = createFakeClient({
      rows: {
        data: [
          consentRow({ revoked_at: '2026-08-08T09:30:00.000Z' }),
          consentRow({ id: 'outro', revoked_at: null }),
        ],
      },
    })

    const consents = await new SupabasePatientConsentRepository(
      fake.client,
    ).listByPatient(CLINIC, PATIENT)

    expect(consents[0].revokedAt?.toISOString()).toBe('2026-08-08T09:30:00.000Z')
    expect(consents[1].revokedAt).toBeNull()
  })

  it('nao deixa a mensagem do Postgres subir para a tela', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({
      rows: {
        data: null,
        error: { code: '42501', message: 'permission denied for relation consents' },
      },
    })

    await expect(
      new SupabasePatientConsentRepository(fake.client).listByPatient(
        CLINIC,
        PATIENT,
      ),
    ).rejects.toThrow(/Falha ao carregar os consentimentos/)

    await expect(
      new SupabasePatientConsentRepository(fake.client).listByPatient(
        CLINIC,
        PATIENT,
      ),
    ).rejects.not.toThrow(/permission denied/)

    // A causa nao some: vai para o log do servidor, com SQLSTATE.
    expect(errorSpy).toHaveBeenCalledWith(
      '[patients] consents.listByPatient',
      expect.objectContaining({ code: '42501' }),
    )

    errorSpy.mockRestore()
  })
})

describe('grant', () => {
  it('grava os quatro valores que o cliente nao escolhe', async () => {
    const fake = createFakeClient({ single: { data: consentRow() } })

    await new SupabasePatientConsentRepository(fake.client).grant(
      CLINIC,
      PATIENT,
      {
        purpose: 'health_data_processing',
        documentVersion: '2026-08.v1',
        grantedAt: new Date('2026-08-07T12:00:00.000Z'),
      },
    )

    const payload = fake.of('insert')[0]?.args[0] as Record<string, unknown>

    expect(payload).toEqual({
      clinic_id: CLINIC,
      subject_type: 'patient',
      subject_id: PATIENT,
      purpose: 'health_data_processing',
      document_version: '2026-08.v1',
      granted_at: '2026-08-07T12:00:00.000Z',
      revoked_at: null,
    })
  })

  it('nao grava ip nem user_agent', async () => {
    const fake = createFakeClient({ single: { data: consentRow() } })

    await new SupabasePatientConsentRepository(fake.client).grant(
      CLINIC,
      PATIENT,
      {
        purpose: 'privacy_policy',
        documentVersion: '2026-08.v1',
        grantedAt: new Date(),
      },
    )

    const payload = fake.of('insert')[0]?.args[0] as Record<string, unknown>

    expect(payload).not.toHaveProperty('ip')
    expect(payload).not.toHaveProperty('user_agent')
  })

  it('traduz recusa de policy em forbidden, sem repetir a mensagem do banco', async () => {
    const fake = createFakeClient({
      single: {
        data: null,
        error: { code: '42501', message: 'new row violates row-level security policy' },
      },
    })

    await expect(
      new SupabasePatientConsentRepository(fake.client).grant(CLINIC, PATIENT, {
        purpose: 'terms_of_service',
        documentVersion: '2026-08.v1',
        grantedAt: new Date(),
      }),
    ).rejects.toMatchObject({ reason: 'forbidden', code: '42501' })
  })

  it('traduz falha de rede em unavailable', async () => {
    const fake = createFakeClient({
      single: { data: null, error: { message: 'fetch failed' } },
    })

    await expect(
      new SupabasePatientConsentRepository(fake.client).grant(CLINIC, PATIENT, {
        purpose: 'terms_of_service',
        documentVersion: '2026-08.v1',
        grantedAt: new Date(),
      }),
    ).rejects.toMatchObject({ reason: 'unavailable' })
  })
})

describe('revokeActive', () => {
  it('carimba a data e fecha somente o que esta vigente, no tenant certo', async () => {
    const fake = createFakeClient({
      rows: { data: [consentRow({ revoked_at: '2026-08-09T10:00:00.000Z' })] },
    })

    const revoked = await new SupabasePatientConsentRepository(
      fake.client,
    ).revokeActive(
      CLINIC,
      PATIENT,
      'health_data_processing',
      new Date('2026-08-09T10:00:00.000Z'),
    )

    expect(fake.of('update')[0]?.args[0]).toEqual({
      revoked_at: '2026-08-09T10:00:00.000Z',
    })

    expectTenantFilters(fake.calls)
    expect(fake.calls).toContainEqual(
      expect.objectContaining({
        method: 'eq',
        args: ['purpose', 'health_data_processing'],
      }),
    )
    // Sem este filtro, revogar de novo reescreveria a data da primeira revogacao
    // — que e parte do registro legal e nao pode ser sobrescrita por um clique.
    expect(fake.calls).toContainEqual(
      expect.objectContaining({ method: 'is', args: ['revoked_at', null] }),
    )

    expect(revoked).toHaveLength(1)
  })

  it('devolve lista vazia quando nao havia nada vigente', async () => {
    const fake = createFakeClient({ rows: { data: [] } })

    const revoked = await new SupabasePatientConsentRepository(
      fake.client,
    ).revokeActive(CLINIC, PATIENT, 'marketing_communication', new Date())

    expect(revoked).toEqual([])
  })

  it('fecha TODAS as linhas vigentes, nao so a mais recente', async () => {
    // Sem indice unico parcial no banco, duas concessoes simultaneas deixam duas
    // linhas vigentes. Revogar uma so deixaria o consentimento de pe com a tela
    // dizendo "revogado".
    const fake = createFakeClient({
      rows: {
        data: [
          consentRow({ revoked_at: '2026-08-09T10:00:00.000Z' }),
          consentRow({ id: 'duplicada', revoked_at: '2026-08-09T10:00:00.000Z' }),
        ],
      },
    })

    const revoked = await new SupabasePatientConsentRepository(
      fake.client,
    ).revokeActive(CLINIC, PATIENT, 'health_data_processing', new Date())

    expect(revoked).toHaveLength(2)
  })
})

describe('subject_id fora do formato uuid', () => {
  it('nao chega a consultar o banco, em nenhum dos tres metodos', async () => {
    const fake = createFakeClient()
    const repository = new SupabasePatientConsentRepository(fake.client)

    for (const id of ['', 'nao-e-uuid', "' or true --", '../../etc/passwd']) {
      await expect(repository.listByPatient(CLINIC, id)).rejects.toMatchObject({
        reason: 'not-found',
      })
      await expect(
        repository.revokeActive(CLINIC, id, 'privacy_policy', new Date()),
      ).rejects.toMatchObject({ reason: 'not-found' })
      await expect(
        repository.grant(CLINIC, id, {
          purpose: 'privacy_policy',
          documentVersion: '2026-08.v1',
          grantedAt: new Date(),
        }),
      ).rejects.toMatchObject({ reason: 'not-found' })
    }

    // A recusa acontece ANTES de qualquer ida ao banco: nenhum `from()` foi
    // chamado, entao nao ha consulta com id malformado nem no log do PostgREST.
    expect(fake.calls).toHaveLength(0)
  })

  it('a mensagem recusada nao ecoa o valor recebido', async () => {
    const fake = createFakeClient()

    await expect(
      new SupabasePatientConsentRepository(fake.client).listByPatient(
        CLINIC,
        'maria.silva@example.com',
      ),
    ).rejects.not.toThrow(/maria\.silva/)
  })

  it('paciente de outra clinica nao ganha tratamento diferente de inexistente', async () => {
    // O id ate e um uuid valido; quem responde "nao existe" e o filtro de clinica
    // mais a RLS, e o adapter nao distingue os dois casos.
    const fake = createFakeClient({ rows: { data: [] } })

    const consents = await new SupabasePatientConsentRepository(
      fake.client,
    ).listByPatient(CLINIC, OTHER_TENANT_PATIENT)

    expect(consents).toEqual([])
    expect(fake.calls).toContainEqual(
      expect.objectContaining({
        method: 'eq',
        args: ['subject_id', OTHER_TENANT_PATIENT],
      }),
    )
  })
})

describe('o adapter nao alcanca chave de servico', () => {
  it('so fala pelo cliente que recebeu, e so com a tabela consents', async () => {
    const fake = createFakeClient({ rows: { data: [] } })
    const repository = new SupabasePatientConsentRepository(fake.client)

    await repository.listByPatient(CLINIC, PATIENT)
    await repository.revokeActive(CLINIC, PATIENT, 'privacy_policy', new Date())

    // Toda consulta saiu do `from` do cliente injetado — o adapter nao monta um
    // segundo cliente, e nao ha caminho daqui ate `lib/supabase/admin.ts`
    // (regra 5 do lint garante o resto).
    expect(fake.calls.length).toBeGreaterThan(0)
    expect(fake.calls.every((call) => call.table === 'consents')).toBe(true)
  })
})
