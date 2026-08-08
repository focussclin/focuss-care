import { describe, expect, it, vi } from 'vitest'

import { SupabasePatientContactRepository } from './SupabasePatientContactRepository'

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const PATIENT = '9019956f-bdd8-4d61-868d-09b02332dad0'
const CONTACT = '11111111-1111-4111-8111-111111111111'

interface Call {
  method: string
  args: unknown[]
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTACT,
    patient_id: PATIENT,
    name: 'Maria da Silva',
    relationship: 'mãe',
    phone: '11999998888',
    email: 'maria@example.com',
    is_legal_guardian: true,
    created_at: '2026-08-08T10:00:00.000Z',
    updated_at: '2026-08-08T10:00:00.000Z',
    ...overrides,
  }
}

function fakeClient(options: { rows?: unknown[]; single?: unknown; maybeSingle?: unknown } = {}) {
  const calls: Call[] = []
  const from = vi.fn(() => {
    const query: Record<string, unknown> = {}

    for (const method of ['select', 'eq', 'order', 'insert', 'update']) {
      query[method] = (...args: unknown[]) => {
        calls.push({ method, args })
        return query
      }
    }

    query.single = async () => ({ data: options.single ?? row(), error: null })
    query.maybeSingle = async () => ({
      data: options.maybeSingle ?? row(),
      error: null,
    })
    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({ data: options.rows ?? [], error: null }).then(
        onFulfilled,
        onRejected,
      )

    return query
  })

  return { calls, client: { from } as never }
}

describe('SupabasePatientContactRepository', () => {
  it('lista contatos somente da clínica e do paciente informados', async () => {
    const fake = fakeClient({ rows: [row()] })

    const contacts = await new SupabasePatientContactRepository(fake.client).listByPatient(
      CLINIC,
      PATIENT,
    )

    expect(contacts[0]).toMatchObject({
      id: CONTACT,
      patientId: PATIENT,
      phone: '11999998888',
      isLegalGuardian: true,
    })
    expect(fake.calls).toContainEqual({ method: 'eq', args: ['clinic_id', CLINIC] })
    expect(fake.calls).toContainEqual({ method: 'eq', args: ['patient_id', PATIENT] })
    expect(fake.calls).toContainEqual({
      method: 'order',
      args: ['is_legal_guardian', { ascending: false }],
    })
  })

  it('cria com o tenant e paciente vindos do servidor', async () => {
    const fake = fakeClient({ single: row() })

    await new SupabasePatientContactRepository(fake.client).create(CLINIC, PATIENT, {
      name: 'Maria da Silva',
      relationship: 'mãe',
      phone: '11999998888',
      email: 'maria@example.com',
      isLegalGuardian: true,
    })

    expect(fake.calls.find((call) => call.method === 'insert')?.args[0]).toMatchObject({
      clinic_id: CLINIC,
      patient_id: PATIENT,
      name: 'Maria da Silva',
      is_legal_guardian: true,
    })
  })

  it('atualiza com os três filtros de isolamento', async () => {
    const fake = fakeClient({ maybeSingle: row() })

    await new SupabasePatientContactRepository(fake.client).update(
      CLINIC,
      PATIENT,
      CONTACT,
      {
        name: 'Maria atualizada',
        relationship: null,
        phone: null,
        email: null,
        isLegalGuardian: false,
      },
    )

    expect(fake.calls).toContainEqual({ method: 'eq', args: ['clinic_id', CLINIC] })
    expect(fake.calls).toContainEqual({ method: 'eq', args: ['patient_id', PATIENT] })
    expect(fake.calls).toContainEqual({ method: 'eq', args: ['id', CONTACT] })
    expect(fake.calls.find((call) => call.method === 'update')?.args[0]).toMatchObject({
      relationship: null,
      phone: null,
      email: null,
      is_legal_guardian: false,
    })
  })

  it('nao consulta o banco para ids inválidos', async () => {
    const fake = fakeClient()
    const repository = new SupabasePatientContactRepository(fake.client)

    await expect(repository.listByPatient(CLINIC, 'nao-e-uuid')).rejects.toMatchObject({
      reason: 'not-found',
    })
    await expect(
      repository.update(CLINIC, PATIENT, 'tambem-invalido', {
        name: 'Contato',
        relationship: null,
        phone: null,
        email: null,
        isLegalGuardian: false,
      }),
    ).rejects.toMatchObject({ reason: 'not-found' })

    expect(fake.calls).toHaveLength(0)
  })
})
