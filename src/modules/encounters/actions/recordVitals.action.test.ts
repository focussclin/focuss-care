import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O alvo da aferição é conferido NO SERVIDOR, contra a clínica da sessão.
 *
 * **Não há banco, nem rede, nem Next em runtime.**
 *
 * # Por que a checagem existe
 *
 * `patientId` e `encounterId` chegam do cliente, e as chaves estrangeiras de
 * `vitals` são de COLUNA ÚNICA: `patient_id` referencia `patients.id`,
 * `encounter_id` referencia `encounters.id`. Elas provam que a linha existe em
 * algum lugar do banco — não que existe nesta clínica. (As migrations locais
 * resolvem isso com FK composta `(id, clinic_id)`; `vitals` é do schema
 * original e não tem uma.)
 *
 * Inserir com `clinic_id` do contexto não basta: a aferição ficaria com o
 * tenant certo apontando para o paciente errado — ausente da ficha que deveria
 * mostrá-la, e presente numa que não deveria.
 *
 * O `encounterId` tem uma armadilha a mais: dentro da MESMA clínica, um
 * atendimento de outro paciente também passa pela FK.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const PATIENT = '22222222-2222-4222-8222-222222222222'
const OTHER_PATIENT = '33333333-3333-4333-8333-333333333333'
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

vi.mock('@/lib/audit/audit-log', () => ({
  recordAuditEvent: async () => ({ recorded: false, reason: 'test' }),
}))

const patientBelongsTo = vi.fn()
const encounterBelongsTo = vi.fn()
const record = vi.fn()
vi.mock('../infrastructure/vitals-repository', () => ({
  vitalsRepositoryFor: () => ({ patientBelongsTo, encounterBelongsTo, record }),
}))

const { recordVitalsAction } = await import('./recordVitals.action')
const { vitalsMessages } = await import('../schemas/vitals.schema')

function entry() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    patientId: PATIENT,
    encounterId: null,
    measuredAt: new Date('2026-08-10T13:00:00.000Z'),
    weightKg: null,
    heightCm: null,
    systolicBp: 120,
    diastolicBp: 80,
    heartRate: null,
    respiratoryRate: null,
    temperatureC: null,
    spo2: null,
    glucoseMgdl: null,
    notes: null,
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

const input = {
  patientId: PATIENT,
  encounterId: '',
  measuredAt: '2026-08-10T10:00',
  weightKg: '',
  heightCm: '',
  systolicBp: '120',
  diastolicBp: '80',
  heartRate: '',
  respiratoryRate: '',
  temperatureC: '',
  spo2: '',
  glucoseMgdl: '',
  notes: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.mockResolvedValue(session())
  patientBelongsTo.mockResolvedValue(true)
  encounterBelongsTo.mockResolvedValue(true)
  record.mockResolvedValue(entry())
})

describe('o paciente é conferido contra a clínica da sessão', () => {
  it('confere ANTES de gravar, com a clínica do contexto', async () => {
    await recordVitalsAction(input)

    expect(patientBelongsTo).toHaveBeenCalledWith(CLINIC, PATIENT)
    expect(record).toHaveBeenCalled()
  })

  it('paciente de outra clínica não grava nada', async () => {
    /*
     * A FK aceitaria: `patients.id` existe. O que não existe é o vínculo com
     * ESTA clínica — e sem esta guarda a aferição entraria com o `clinic_id`
     * certo e o paciente errado.
     */
    patientBelongsTo.mockResolvedValue(false)

    const result = await recordVitalsAction({ ...input, patientId: OTHER_PATIENT })

    expect(result.ok).toBe(false)
    expect(record).not.toHaveBeenCalled()
    if (!result.ok) expect(result.error.message).toBe(vitalsMessages.notFound)
  })

  it('a clínica nunca sai da entrada', async () => {
    await recordVitalsAction({ ...input, clinicId: 'outra-clinica' })

    expect(patientBelongsTo).toHaveBeenCalledWith(CLINIC, PATIENT)
    expect(record).toHaveBeenCalledWith(CLINIC, USER, expect.anything())
  })
})

describe('o atendimento precisa ser da clínica E do paciente', () => {
  it('sem atendimento informado, nada é conferido', async () => {
    // O painel da ficha grava sem atendimento — `encounter_id` é nullable.
    await recordVitalsAction(input)

    expect(encounterBelongsTo).not.toHaveBeenCalled()
    expect(record).toHaveBeenCalled()
  })

  it('confere com clínica, atendimento e paciente juntos', async () => {
    await recordVitalsAction({ ...input, encounterId: ENCOUNTER })

    expect(encounterBelongsTo).toHaveBeenCalledWith(CLINIC, ENCOUNTER, PATIENT)
  })

  it('atendimento de OUTRO paciente é recusado', async () => {
    /*
     * A armadilha que a FK não pega: mesmo tenant, paciente diferente. A
     * aferição ficaria pendurada no atendimento de outra pessoa.
     */
    encounterBelongsTo.mockResolvedValue(false)

    const result = await recordVitalsAction({ ...input, encounterId: ENCOUNTER })

    expect(result.ok).toBe(false)
    expect(record).not.toHaveBeenCalled()
    if (!result.ok) expect(result.error.message).toBe(vitalsMessages.encounterMismatch)
  })

  it('atendimento de outra clínica é recusado pela mesma checagem', async () => {
    encounterBelongsTo.mockResolvedValue(false)

    const result = await recordVitalsAction({ ...input, encounterId: ENCOUNTER })

    expect(result.ok).toBe(false)
    expect(record).not.toHaveBeenCalled()
  })

  it('paciente inválido barra antes de olhar o atendimento', async () => {
    // Sem paciente válido, não há com o que comparar o atendimento.
    patientBelongsTo.mockResolvedValue(false)

    await recordVitalsAction({ ...input, encounterId: ENCOUNTER })

    expect(encounterBelongsTo).not.toHaveBeenCalled()
    expect(record).not.toHaveBeenCalled()
  })
})

describe('quem pode registrar', () => {
  it.each(['owner', 'professional', 'receptionist'])('%s registra', async (role) => {
    // A matriz nomeia "sinais vitais" em `encounter.write`.
    sessionState.mockResolvedValue(session(role))

    const result = await recordVitalsAction(input)

    expect(result.ok).toBe(true)
  })

  it('finance não registra, e nem chega a consultar o paciente', async () => {
    sessionState.mockResolvedValue(session('finance'))

    const result = await recordVitalsAction(input)

    expect(result.ok).toBe(false)
    expect(patientBelongsTo).not.toHaveBeenCalled()
    expect(record).not.toHaveBeenCalled()
  })
})

describe('aferição no futuro', () => {
  it('é recusada antes de qualquer consulta', async () => {
    const result = await recordVitalsAction({ ...input, measuredAt: '2099-01-01T10:00' })

    expect(result.ok).toBe(false)
    expect(patientBelongsTo).not.toHaveBeenCalled()
    expect(record).not.toHaveBeenCalled()
  })
})
