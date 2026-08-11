import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A lista que alimenta o seletor de vínculo devolve **queixa principal**.
 *
 * Isso a torna leitura clínica, e não listagem operacional: a permissão que a
 * protege é `record.read`, e não `encounter.read`. A recepção opera
 * `/atendimentos` com `encounter.read` — se esta action respondesse a ela, a
 * queixa chegaria ao balcão pela porta lateral.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const PATIENT = '22222222-2222-4222-8222-222222222222'
const ENCOUNTER = '44444444-4444-4444-8444-444444444444'

vi.mock('next/cache', () => ({ updateTag: () => {}, revalidatePath: () => {} }))
vi.mock('next/server', () => ({
  after: (callback: () => unknown) => {
    void callback()
  },
}))
vi.mock('next/navigation', () => ({ unstable_rethrow: () => {} }))

const sessionState = vi.fn()
vi.mock('@/lib/auth/session', () => ({ getSessionState: () => sessionState() }))

const supabase = { __fake: true }
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => supabase,
}))

const recordAuditEvent = vi.fn(async () => ({
  recorded: false as const,
  reason: 'test',
}))
vi.mock('@/lib/audit/audit-log', () => ({
  recordAuditEvent: () => recordAuditEvent(),
}))

const listPatientEncounters = vi.fn()
vi.mock('../infrastructure/repository', () => ({
  medicalRecordRepositoryFor: () => ({ listPatientEncounters }),
}))

const { listPatientEncountersAction } = await import(
  './listPatientEncounters.action'
)
const { recordMessages, RECORD_ENCOUNTER_LIMIT } = await import(
  '../schemas/record.schema'
)

function encounter() {
  return {
    id: ENCOUNTER,
    status: 'open' as const,
    startedAt: new Date('2026-08-10T17:30:00.000Z'),
    endedAt: null,
    professionalName: 'Dra. Helena',
    chiefComplaint: 'Dor lombar há três dias',
  }
}

function session(role: string | null = 'professional') {
  return {
    status: 'active' as const,
    user: { id: USER, email: null, displayName: 'Teste', avatarUrl: null },
    clinicId: CLINIC,
    clinicName: null,
    role,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.mockResolvedValue(session())
  listPatientEncounters.mockResolvedValue([encounter()])
})

describe('quem enxerga os atendimentos com a queixa', () => {
  it.each(['owner', 'professional'])('%s enxerga', async (role) => {
    sessionState.mockResolvedValue(session(role))

    const result = await listPatientEncountersAction({ patientId: PATIENT })

    expect(result.ok).toBe(true)
  })

  it.each(['admin', 'receptionist', 'finance'])('%s NÃO enxerga', async (role) => {
    sessionState.mockResolvedValue(session(role))

    const result = await listPatientEncountersAction({ patientId: PATIENT })

    expect(result.ok).toBe(false)
    expect(listPatientEncounters).not.toHaveBeenCalled()
  })
})

describe('isolamento entre clínicas', () => {
  it('a clínica sai da sessão, nunca da entrada', async () => {
    await listPatientEncountersAction({
      patientId: PATIENT,
      clinicId: 'outra-clinica',
    })

    expect(listPatientEncounters).toHaveBeenCalledWith(
      CLINIC,
      PATIENT,
      RECORD_ENCOUNTER_LIMIT,
    )
  })

  it('paciente que não é uuid nem chega ao repositório', async () => {
    const result = await listPatientEncountersAction({ patientId: 'joao' })

    expect(result.ok).toBe(false)
    expect(listPatientEncounters).not.toHaveBeenCalled()
  })
})

describe('o que atravessa a fronteira', () => {
  it('datas viram ISO e a queixa é preservada', async () => {
    const result = await listPatientEncountersAction({ patientId: PATIENT })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data[0]).toEqual({
        id: ENCOUNTER,
        status: 'open',
        startedAt: '2026-08-10T17:30:00.000Z',
        endedAt: null,
        professionalName: 'Dra. Helena',
        chiefComplaint: 'Dor lombar há três dias',
      })
    }
  })
})

describe('falha de leitura', () => {
  it('não derruba o formulário e não vaza a mensagem do banco', async () => {
    /*
     * O erro do Postgres pode ecoar o valor consultado, e aqui o valor inclui
     * `chief_complaint`. Só a CLASSE da falha vai para o log.
     */
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    listPatientEncounters.mockRejectedValue(
      new Error('coluna chief_complaint: Dor lombar há três dias'),
    )

    const result = await listPatientEncountersAction({ patientId: PATIENT })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe(recordMessages.encountersUnavailable)
    }

    expect(JSON.stringify(spy.mock.calls)).not.toContain('Dor lombar')
    spy.mockRestore()
  })
})

describe('ruído na trilha de auditoria', () => {
  it('escolher o paciente no formulário não gera evento', async () => {
    // A leitura de prontuário é auditada na ROTA, onde o conteúdo é entregue.
    await listPatientEncountersAction({ patientId: PATIENT })

    expect(recordAuditEvent).not.toHaveBeenCalled()
  })
})
