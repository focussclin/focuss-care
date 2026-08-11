import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O registro de prontuário passa por três portas antes de existir.
 *
 * **Não há banco, nem rede, nem Next em runtime.**
 *
 *  1. **Papel** — `record.write`: só `owner` e `professional`.
 *  2. **Cadastro profissional** — `current_professional_id()`. Quem não tem
 *     linha em `professionals` não assina prontuário, mesmo com o papel.
 *  3. **Atendimento vinculado** — quando informado, precisa ser desta clínica E
 *     deste paciente. A FK de `medical_records` é de coluna única: prova
 *     existência, não tenancy.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const AUTHOR = '55555555-5555-4555-8555-555555555555'
const PATIENT = '22222222-2222-4222-8222-222222222222'
const ENCOUNTER = '44444444-4444-4444-8444-444444444444'
const RECORD = '11111111-1111-4111-8111-111111111111'

vi.mock('next/cache', () => ({ updateTag: () => {}, revalidatePath: () => {} }))
vi.mock('next/server', () => ({
  after: (callback: () => unknown) => {
    void callback()
  },
}))
vi.mock('next/navigation', () => ({ unstable_rethrow: () => {} }))

const sessionState = vi.fn()
vi.mock('@/lib/auth/session', () => ({ getSessionState: () => sessionState() }))

const currentProfessionalId = vi.fn()
vi.mock('@/lib/auth/active-clinic', () => ({
  getCurrentProfessionalId: () => currentProfessionalId(),
}))

const supabase = { __fake: true }
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => supabase,
}))

const recordAuditEvent = vi.fn(
  async (event: unknown): Promise<{ recorded: false; reason: string }> => {
    void event
    return { recorded: false, reason: 'test' }
  },
)
vi.mock('@/lib/audit/audit-log', () => ({
  recordAuditEvent: (event: unknown) => recordAuditEvent(event),
}))

const encounterBelongsTo = vi.fn()
const create = vi.fn()
vi.mock('../infrastructure/repository', () => ({
  medicalRecordRepositoryFor: () => ({ encounterBelongsTo, create }),
}))

const { createRecordAction } = await import('./createRecord.action')
const { recordMessages } = await import('../schemas/record.schema')

function medicalRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: RECORD,
    patientId: PATIENT,
    encounterId: null,
    encounter: null,
    authorId: AUTHOR,
    authorName: 'Dra. Helena',
    recordType: 'evolution' as const,
    content: 'Paciente relatou melhora da dor.',
    version: 1,
    supersedesId: null,
    signedAt: null,
    createdAt: new Date('2026-08-10T17:45:00.000Z'),
    ...overrides,
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
  recordType: 'evolution',
  content: 'Paciente relatou melhora da dor.',
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.mockResolvedValue(session())
  currentProfessionalId.mockResolvedValue(AUTHOR)
  encounterBelongsTo.mockResolvedValue(true)
  create.mockResolvedValue(medicalRecord())
})

describe('quem pode registrar', () => {
  it.each(['owner', 'professional'])('%s registra', async (role) => {
    sessionState.mockResolvedValue(session(role))

    const result = await createRecordAction(input)

    expect(result.ok).toBe(true)
  })

  it.each(['admin', 'receptionist', 'finance'])('%s NÃO registra', async (role) => {
    // Administrar a clínica não é cuidar do paciente.
    sessionState.mockResolvedValue(session(role))

    const result = await createRecordAction(input)

    expect(result.ok).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })

  it('papel permitido SEM cadastro profissional não registra', async () => {
    currentProfessionalId.mockResolvedValue(null)

    const result = await createRecordAction(input)

    expect(result.ok).toBe(false)
    expect(create).not.toHaveBeenCalled()
    if (!result.ok) {
      expect(result.error.message).toBe(recordMessages.notAProfessional)
    }
  })
})

describe('o vínculo com o atendimento', () => {
  it('chega ao repositório quando informado', async () => {
    /*
     * A regressão que esta fatia corrigiu: a coluna existia, o adapter a
     * gravava, e o formulário nunca a enviava — toda evolução nascia solta.
     */
    await createRecordAction({ ...input, encounterId: ENCOUNTER })

    expect(create).toHaveBeenCalledWith(
      CLINIC,
      expect.objectContaining({ encounterId: ENCOUNTER }),
      AUTHOR,
      USER,
    )
  })

  it('é conferido contra a clínica E o paciente', async () => {
    await createRecordAction({ ...input, encounterId: ENCOUNTER })

    expect(encounterBelongsTo).toHaveBeenCalledWith(CLINIC, ENCOUNTER, PATIENT)
  })

  it('atendimento de outro paciente não grava nada', async () => {
    // Mesmo tenant, paciente diferente: a FK não pega, e a evolução ficaria
    // pendurada na consulta de outra pessoa.
    encounterBelongsTo.mockResolvedValue(false)

    const result = await createRecordAction({ ...input, encounterId: ENCOUNTER })

    expect(result.ok).toBe(false)
    expect(create).not.toHaveBeenCalled()
    if (!result.ok) {
      expect(result.error.message).toBe(recordMessages.encounterMismatch)
    }
  })

  it('sem vínculo informado, nada é conferido', async () => {
    const result = await createRecordAction(input)

    expect(encounterBelongsTo).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
    expect(create).toHaveBeenCalledWith(
      CLINIC,
      expect.objectContaining({ encounterId: null }),
      AUTHOR,
      USER,
    )
  })
})

describe('o autor e a clínica nunca vêm do cliente', () => {
  it('grava o profissional da sessão', async () => {
    await createRecordAction({ ...input, authorId: 'outro-profissional' })

    expect(create).toHaveBeenCalledWith(
      CLINIC,
      expect.anything(),
      AUTHOR,
      USER,
    )
  })

  it('a clínica enviada pelo formulário é ignorada', async () => {
    await createRecordAction({ ...input, clinicId: 'outra-clinica' })

    expect(create).toHaveBeenCalledWith(CLINIC, expect.anything(), AUTHOR, USER)
  })
})

describe('a auditoria não copia conteúdo clínico', () => {
  it('registra o vínculo e o tipo, nunca o texto do registro', async () => {
    /*
     * `audit_log` é append-only e legível por `audit.read` — que `admin` tem e
     * `record.read` não. Um trecho de evolução ali seria acesso ao prontuário
     * pela porta lateral.
     */
    create.mockResolvedValue(medicalRecord({ encounterId: ENCOUNTER }))

    await createRecordAction({ ...input, encounterId: ENCOUNTER })

    const event = recordAuditEvent.mock.calls[0][0] as {
      action: string
      after: Record<string, unknown>
    }

    expect(event.action).toBe('record.created')
    expect(event.after).toEqual({
      record_type: 'evolution',
      version: 1,
      patient_id: PATIENT,
      encounter_id: ENCOUNTER,
    })

    expect(JSON.stringify(event)).not.toContain('melhora da dor')
  })

  it('a queixa do atendimento não entra na trilha', async () => {
    // O id do atendimento não diz nada sobre a saúde de ninguém; a queixa diz.
    create.mockResolvedValue(
      medicalRecord({
        encounterId: ENCOUNTER,
        encounter: {
          id: ENCOUNTER,
          status: 'open' as const,
          startedAt: new Date('2026-08-10T17:30:00.000Z'),
          endedAt: null,
          professionalName: 'Dra. Helena',
          chiefComplaint: 'Dor lombar há três dias',
        },
      }),
    )

    await createRecordAction({ ...input, encounterId: ENCOUNTER })

    const event = recordAuditEvent.mock.calls[0][0]

    expect(JSON.stringify(event)).not.toContain('Dor lombar')
  })
})
