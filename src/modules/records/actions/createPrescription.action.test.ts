import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A prescrição passa por três portas antes de existir.
 *
 * **Não há banco, nem rede, nem Next em runtime.**
 *
 *  1. **Papel** — `record.write`, a permissão mais restritiva do produto.
 *  2. **Cadastro profissional** — `current_professional_id()`. Quem não tem
 *     linha em `professionals` não prescreve, mesmo com o papel: `author_id`
 *     aponta para quem tem conselho, não para um login.
 *  3. **Alvo** — paciente desta clínica; atendimento, quando informado, desta
 *     clínica E deste paciente. As FKs de `prescriptions` são de coluna única e
 *     provam existência, não tenancy.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const AUTHOR = '55555555-5555-4555-8555-555555555555'
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

const currentProfessionalId = vi.fn()
vi.mock('@/lib/auth/active-clinic', () => ({
  getCurrentProfessionalId: () => currentProfessionalId(),
}))

const supabase = { __fake: true }
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => supabase,
}))

/*
 * O parametro precisa ser DECLARADO no `vi.fn`, e nao so recebido.
 *
 * Sem ele, `mock.calls` e tipado como `[]` e `calls[0][0]` nao existe para o
 * typecheck — mesmo com o teste passando em runtime.
 */
const recordAuditEvent = vi.fn(
  async (event: unknown): Promise<{ recorded: false; reason: string }> => {
    void event
    return { recorded: false, reason: 'test' }
  },
)
vi.mock('@/lib/audit/audit-log', () => ({
  recordAuditEvent: (event: unknown) => recordAuditEvent(event),
}))

const patientBelongsTo = vi.fn()
const encounterBelongsTo = vi.fn()
const create = vi.fn()
vi.mock('../infrastructure/prescription-repository', () => ({
  prescriptionRepositoryFor: () => ({ patientBelongsTo, encounterBelongsTo, create }),
}))

const { createPrescriptionAction } = await import('./createPrescription.action')
const { prescriptionMessages } = await import('../schemas/prescription.schema')

function prescription() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    patientId: PATIENT,
    encounterId: null,
    authorId: AUTHOR,
    authorName: 'Dra. Helena',
    issuedAt: new Date('2026-08-10T13:00:00.000Z'),
    validUntil: null,
    signedAt: null,
    externalUrl: null,
    items: [
      {
        id: 'i1',
        drugName: 'Amoxicilina 500 mg',
        dosage: '1 comprimido',
        route: 'Via oral',
        frequency: '8 em 8 horas',
        duration: '7 dias',
        quantity: '1 caixa',
        instructions: null,
        sortOrder: 0,
      },
    ],
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
  validUntil: '',
  items: [{ drugName: 'Amoxicilina 500 mg', dosage: '1 comprimido' }],
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.mockResolvedValue(session())
  currentProfessionalId.mockResolvedValue(AUTHOR)
  patientBelongsTo.mockResolvedValue(true)
  encounterBelongsTo.mockResolvedValue(true)
  create.mockResolvedValue(prescription())
})

describe('quem pode prescrever', () => {
  it.each(['owner', 'professional'])('%s prescreve', async (role) => {
    sessionState.mockResolvedValue(session(role))

    const result = await createPrescriptionAction(input)

    expect(result.ok).toBe(true)
  })

  it.each(['admin', 'receptionist', 'finance'])('%s NÃO prescreve', async (role) => {
    // `record.write` é a permissão mais restritiva: administrar a clínica não é
    // cuidar do paciente.
    sessionState.mockResolvedValue(session(role))

    const result = await createPrescriptionAction(input)

    expect(result.ok).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })

  it('papel permitido SEM cadastro profissional não prescreve', async () => {
    /*
     * A segunda porta. Um `owner` que administra a clínica sem ser clínico
     * passa pelo papel e para aqui — com uma mensagem que diz o que fazer, em
     * vez de "sem permissão".
     */
    currentProfessionalId.mockResolvedValue(null)

    const result = await createPrescriptionAction(input)

    expect(result.ok).toBe(false)
    expect(create).not.toHaveBeenCalled()
    if (!result.ok) expect(result.error.message).toBe(prescriptionMessages.notAProfessional)
  })
})

describe('o autor nunca vem do cliente', () => {
  it('grava o profissional da sessão', async () => {
    await createPrescriptionAction(input)

    expect(create).toHaveBeenCalledWith(CLINIC, AUTHOR, expect.anything())
  })

  it('`authorId` enviado pelo formulário é ignorado', async () => {
    /*
     * Aceitá-lo deixaria alguém prescrever em nome de outro profissional — o
     * que numa receita é falsidade ideológica com consequência clínica.
     */
    await createPrescriptionAction({ ...input, authorId: 'outro-profissional' })

    expect(create).toHaveBeenCalledWith(CLINIC, AUTHOR, expect.anything())
  })
})

describe('isolamento entre clínicas', () => {
  it('o paciente é conferido contra a clínica da sessão', async () => {
    await createPrescriptionAction(input)

    expect(patientBelongsTo).toHaveBeenCalledWith(CLINIC, PATIENT)
  })

  it('paciente de outra clínica não grava nada', async () => {
    patientBelongsTo.mockResolvedValue(false)

    const result = await createPrescriptionAction({ ...input, patientId: OTHER_PATIENT })

    expect(result.ok).toBe(false)
    expect(create).not.toHaveBeenCalled()
    if (!result.ok) expect(result.error.message).toBe(prescriptionMessages.notFound)
  })

  it('a clínica nunca sai da entrada', async () => {
    await createPrescriptionAction({ ...input, clinicId: 'outra-clinica' })

    expect(create).toHaveBeenCalledWith(CLINIC, AUTHOR, expect.anything())
  })

  it('atendimento de outro paciente é recusado', async () => {
    // Mesmo tenant, paciente diferente: a FK não pega, e a receita ficaria
    // pendurada no atendimento de outra pessoa.
    encounterBelongsTo.mockResolvedValue(false)

    const result = await createPrescriptionAction({ ...input, encounterId: ENCOUNTER })

    expect(result.ok).toBe(false)
    expect(create).not.toHaveBeenCalled()
    if (!result.ok) expect(result.error.message).toBe(prescriptionMessages.encounterMismatch)
  })

  it('sem atendimento informado, nada é conferido', async () => {
    await createPrescriptionAction(input)

    expect(encounterBelongsTo).not.toHaveBeenCalled()
    expect(create).toHaveBeenCalled()
  })
})

describe('validade', () => {
  it('data já vencida é recusada antes de qualquer consulta', async () => {
    /*
     * Isto NÃO é julgamento clínico sobre o prazo: a aplicação não opina se
     * trinta dias são muitos ou poucos, só recusa data que nasceu vencida.
     */
    const result = await createPrescriptionAction({ ...input, validUntil: '2020-01-01' })

    expect(result.ok).toBe(false)
    expect(patientBelongsTo).not.toHaveBeenCalled()
    if (!result.ok) expect(result.error.message).toBe(prescriptionMessages.validUntilPast)
  })

  it('sem validade declarada grava normalmente', async () => {
    const result = await createPrescriptionAction(input)

    expect(result.ok).toBe(true)
  })
})

describe('itens', () => {
  it('prescrição sem item nem chega ao repositório', async () => {
    const result = await createPrescriptionAction({ ...input, items: [] })

    expect(result.ok).toBe(false)
    expect(patientBelongsTo).not.toHaveBeenCalled()
  })

  it('item sem medicamento é recusado', async () => {
    const result = await createPrescriptionAction({ ...input, items: [{ drugName: '' }] })

    expect(result.ok).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })
})

/**
 * A trilha existe para reconstruir QUEM prescreveu para quem e quando.
 */
describe('a auditoria não copia conteúdo clínico', () => {
  it('registra o vínculo e a contagem, nunca o medicamento', async () => {
    /*
     * `audit_log` tem outra permissão de leitura (`audit.read`, que `admin` tem
     * e `record.read` não). Copiar a receita para lá criaria uma segunda via do
     * dado clínico fora da trava que o protege.
     */
    await createPrescriptionAction(input)

    const event = recordAuditEvent.mock.calls[0][0] as {
      action: string
      after: Record<string, unknown>
    }

    expect(event.action).toBe('prescription.created')
    expect(event.after).toEqual({
      patient_id: PATIENT,
      encounter_id: null,
      item_count: 1,
    })

    const serialized = JSON.stringify(event)
    expect(serialized).not.toContain('Amoxicilina')
    expect(serialized).not.toContain('comprimido')
  })
})
