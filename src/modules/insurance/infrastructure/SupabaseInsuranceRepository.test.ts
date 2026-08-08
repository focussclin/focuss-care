import { describe, expect, it, vi } from 'vitest'

import { SupabaseInsuranceRepository } from './SupabaseInsuranceRepository'

/**
 * Contrato dos convênios (V-01).
 *
 * As duas recusas testadas aqui protegem coisas que só se descobrem tarde:
 * responder duas vezes a mesma guia apaga o motivo da negativa — o texto usado
 * para recorrer — e montar guia com carteirinha de outro paciente só é recusado
 * pela operadora depois do atendimento marcado.
 *
 * Sem banco e sem rede. Tenancy real continua sendo pgTAP (R1).
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const AUTHORIZATION = '9019956f-bdd8-4d61-868d-09b02332dad0'
const CARD = '5f2b1a3c-4d5e-4f60-8a71-9b2c3d4e5f60'
const PATIENT = '11111111-1111-4111-8111-111111111111'

interface RecordedCall {
  query: number
  table: string
  method: string
  args: unknown[]
}

function authorizationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: AUTHORIZATION,
    patient_id: PATIENT,
    authorization_number: null,
    status: 'requested',
    procedures: [{ code: '10101012', description: 'Consulta', quantity: 1 }],
    requested_at: '2026-08-10T12:00:00.000Z',
    answered_at: null,
    expires_at: null,
    denial_reason: null,
    patients: { full_name: 'Marina Costa' },
    patient_insurances: {
      card_number: '0001',
      insurance_plans: {
        name: 'Enfermaria',
        insurance_providers: { name: 'Unimed' },
      },
    },
    ...overrides,
  }
}

function createFakeClient(results: {
  authorization?: unknown
  /** Linha devolvida ao buscar a carteirinha. */
  card?: unknown
  /** O UPDATE da guia encontrou linha pendente? */
  answered?: unknown
  rows?: (table: string) => unknown[]
}) {
  const calls: RecordedCall[] = []
  let queryIndex = -1

  const from = vi.fn((table: string) => {
    queryIndex += 1
    const index = queryIndex

    const query: Record<string, unknown> = {}
    const own = () => calls.filter((call) => call.query === index)
    const used = (method: string) =>
      own().some((call) => call.method === method)
    const selectArg = () =>
      own().find((call) => call.method === 'select')?.args[0] as
        | string
        | undefined

    for (const method of [
      'select',
      'eq',
      'neq',
      'in',
      'is',
      'order',
      'limit',
      'update',
      'insert',
      'delete',
    ]) {
      query[method] = (...args: unknown[]) => {
        calls.push({ query: index, table, method, args })
        return query
      }
    }

    const resolve = () => {
      if (table === 'patient_insurances' && selectArg() === 'patient_id') {
        return 'card' in results ? results.card : { patient_id: PATIENT }
      }

      if (table === 'insurance_authorizations') {
        if (used('insert')) return { id: AUTHORIZATION }
        if (used('update')) {
          return 'answered' in results ? results.answered : { id: AUTHORIZATION }
        }
        return 'authorization' in results
          ? results.authorization
          : authorizationRow()
      }

      if (table === 'insurance_providers') {
        return {
          id: 'provider-1',
          name: 'Unimed',
          ans_code: '123',
          cnpj: null,
          is_active: true,
          notes: null,
        }
      }

      return null
    }

    query.single = async () => {
      calls.push({ query: index, table, method: 'single', args: [] })
      return { data: resolve(), error: null }
    }

    query.maybeSingle = async () => {
      calls.push({ query: index, table, method: 'maybeSingle', args: [] })
      return { data: resolve(), error: null }
    }

    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({
        data: results.rows?.(table) ?? [],
        count: 0,
        error: null,
      }).then(onFulfilled, onRejected)

    return query
  })

  return {
    calls,
    client: { from } as never,
    ofTable: (table: string) => calls.filter((call) => call.table === table),
  }
}

describe('createAuthorization', () => {
  it('lê o paciente da CARTEIRINHA, e não da entrada', async () => {
    const fake = createFakeClient({})

    await new SupabaseInsuranceRepository(fake.client).createAuthorization(
      CLINIC,
      {
        patientInsuranceId: CARD,
        procedures: [{ code: '', description: 'Consulta', quantity: 1 }],
        notes: null,
      },
      USER,
    )

    const insert = fake
      .ofTable('insurance_authorizations')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    /*
     * Receber `patient_id` do cliente permitiria pedir autorizacao para o
     * paciente A usando a carteirinha de B — erro que a operadora so recusaria
     * depois, com o atendimento ja marcado.
     */
    expect(insert.patient_id).toBe(PATIENT)
    expect(insert.patient_insurance_id).toBe(CARD)
  })

  it('nasce pendente e SEM número de autorização', async () => {
    const fake = createFakeClient({})

    await new SupabaseInsuranceRepository(fake.client).createAuthorization(
      CLINIC,
      {
        patientInsuranceId: CARD,
        procedures: [{ code: '', description: 'Consulta', quantity: 1 }],
        notes: null,
      },
      USER,
    )

    const insert = fake
      .ofTable('insurance_authorizations')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    // O numero vem da operadora. Inventa-lo produziria uma guia que o
    // faturamento rejeita depois do atendimento feito.
    expect(insert.status).toBe('requested')
    expect(insert).not.toHaveProperty('authorization_number')
  })

  it('carteirinha inativa ou de outra clínica vira not-found', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({ card: null })

    await expect(
      new SupabaseInsuranceRepository(fake.client).createAuthorization(
        CLINIC,
        {
          patientInsuranceId: CARD,
          procedures: [{ code: '', description: 'Consulta', quantity: 1 }],
          notes: null,
        },
        USER,
      ),
    ).rejects.toMatchObject({ reason: 'not-found' })

    spy.mockRestore()
  })
})

describe('answerAuthorization', () => {
  it('só responde guia PENDENTE', async () => {
    const fake = createFakeClient({})

    await new SupabaseInsuranceRepository(fake.client).answerAuthorization(
      CLINIC,
      AUTHORIZATION,
      {
        outcome: 'approved',
        authorizationNumber: 'A-123',
        expiresAt: new Date(2026, 8, 30),
      },
    )

    // O filtro tambem impede que duas pessoas respondendo ao mesmo tempo
    // sobrescrevam uma a outra: a segunda nao encontra linha.
    expect(fake.ofTable('insurance_authorizations')).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['status', 'requested'] }),
    )
  })

  it('guia já respondida devolve already-answered, não sucesso silencioso', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({ answered: null })

    await expect(
      new SupabaseInsuranceRepository(fake.client).answerAuthorization(
        CLINIC,
        AUTHORIZATION,
        { outcome: 'denied', denialReason: 'fora de cobertura' },
      ),
    ).rejects.toMatchObject({ reason: 'already-answered' })

    spy.mockRestore()
  })

  it('aprovar grava número e limpa motivo de negativa', async () => {
    const fake = createFakeClient({})

    await new SupabaseInsuranceRepository(fake.client).answerAuthorization(
      CLINIC,
      AUTHORIZATION,
      {
        outcome: 'approved',
        authorizationNumber: 'A-123',
        expiresAt: new Date(2026, 8, 30),
      },
    )

    const update = fake
      .ofTable('insurance_authorizations')
      .find((call) => call.method === 'update')?.args[0] as Record<
      string,
      unknown
    >

    expect(update.status).toBe('approved')
    expect(update.authorization_number).toBe('A-123')
    expect(update.denial_reason).toBeNull()
    expect(update.answered_at).toBeTypeOf('string')
  })

  it('negar grava o motivo e NÃO inventa número', async () => {
    const fake = createFakeClient({})

    await new SupabaseInsuranceRepository(fake.client).answerAuthorization(
      CLINIC,
      AUTHORIZATION,
      { outcome: 'denied', denialReason: 'procedimento fora de cobertura' },
    )

    const update = fake
      .ofTable('insurance_authorizations')
      .find((call) => call.method === 'update')?.args[0] as Record<
      string,
      unknown
    >

    expect(update.status).toBe('denied')
    expect(update.denial_reason).toBe('procedimento fora de cobertura')
    expect(update).not.toHaveProperty('authorization_number')
  })
})

describe('leitura', () => {
  it('procedimentos em formato desconhecido viram lista vazia, não linha inventada', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({
      authorization: authorizationRow({ procedures: { qtd: 'dois' } }),
      answered: { id: AUTHORIZATION },
    })

    const result = await new SupabaseInsuranceRepository(
      fake.client,
    ).answerAuthorization(CLINIC, AUTHORIZATION, {
      outcome: 'denied',
      denialReason: 'x',
    })

    /*
     * A guia continua aparecendo com status e numero — que e o que a recepcao
     * precisa para ligar na operadora. Fabricar um procedimento a partir de
     * JSON ilegivel seria pior que mostrar nenhum.
     */
    expect(result.procedures).toEqual([])
    expect(result.status).toBe('requested')

    spy.mockRestore()
  })

  it('desativar operadora não mexe nos planos', async () => {
    const fake = createFakeClient({})

    await new SupabaseInsuranceRepository(fake.client).setProviderActive(
      CLINIC,
      'provider-1',
      false,
    )

    // Apagar o estado dos planos perderia a informacao de quais estavam ativos,
    // e reativar a operadora depois nao saberia o que restaurar.
    expect(fake.ofTable('insurance_plans')).toHaveLength(0)
  })

  it('filtra sempre pela clínica ativa', async () => {
    const fake = createFakeClient({})

    await new SupabaseInsuranceRepository(fake.client).listAuthorizations(
      CLINIC,
      10,
    )

    expect(fake.ofTable('insurance_authorizations')).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
    )
  })

  it('só oferece carteirinha ATIVA para abrir guia', async () => {
    const fake = createFakeClient({})

    await new SupabaseInsuranceRepository(fake.client).listPatientInsurances(
      CLINIC,
    )

    expect(fake.ofTable('patient_insurances')).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['is_active', true] }),
    )
  })
})
