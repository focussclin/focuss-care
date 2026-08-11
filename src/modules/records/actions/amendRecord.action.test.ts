import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A correção de um registro de prontuário.
 *
 * A action ganhou teste próprio quando a FICHA passou a oferecer "Corrigir" —
 * até então o botão vivia só em `/prontuarios`, e o que a correção invalida
 * deixou de ser uma tela só.
 *
 * **Não há banco, nem rede, nem Next em runtime.** O que se prova aqui é o que
 * a action decide: quem corrige, o que ela revalida e o que ela conta à
 * auditoria.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const AUTHOR = '55555555-5555-4555-8555-555555555555'
const PATIENT = '22222222-2222-4222-8222-222222222222'
const RECORD = '11111111-1111-4111-8111-111111111111'
const PREVIOUS = '33333333-3333-4333-8333-333333333333'

const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  updateTag: () => {},
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}))
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

const amend = vi.fn()
vi.mock('../infrastructure/repository', () => ({
  medicalRecordRepositoryFor: () => ({ amend }),
}))

const { amendRecordAction } = await import('./amendRecord.action')
const { recordMessages } = await import('../schemas/record.schema')
const { MedicalRecordRepositoryError } = await import(
  '../domain/MedicalRecordRepositoryError'
)

function amendedRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: RECORD,
    patientId: PATIENT,
    encounterId: null,
    encounter: null,
    authorId: AUTHOR,
    authorName: 'Dra. Helena',
    recordType: 'evolution' as const,
    content: 'Texto corrigido: paciente relatou melhora da dor.',
    version: 2,
    supersedesId: PREVIOUS,
    signedAt: null,
    createdAt: new Date('2026-08-11T09:00:00.000Z'),
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

const input = { recordId: RECORD, content: 'Texto corrigido.' }

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.mockResolvedValue(session())
  currentProfessionalId.mockResolvedValue(AUTHOR)
  amend.mockResolvedValue(amendedRecord())
})

describe('quem corrige', () => {
  it.each(['owner', 'professional'])('%s corrige', async (role) => {
    sessionState.mockResolvedValue(session(role))

    const result = await amendRecordAction(input)

    expect(result.ok).toBe(true)
  })

  it.each(['admin', 'receptionist', 'finance'])('%s NÃO corrige', async (role) => {
    sessionState.mockResolvedValue(session(role))

    const result = await amendRecordAction(input)

    expect(result.ok).toBe(false)
    expect(amend).not.toHaveBeenCalled()
  })

  it('papel permitido SEM cadastro profissional não corrige', async () => {
    /*
     * Quem corrige ASSINA a versão nova — `author_id` é `professionals.id`. A
     * versão anterior continua assinada por quem a escreveu.
     */
    currentProfessionalId.mockResolvedValue(null)

    const result = await amendRecordAction(input)

    expect(result.ok).toBe(false)
    expect(amend).not.toHaveBeenCalled()
    if (!result.ok) {
      expect(result.error.message).toBe(recordMessages.notAProfessional)
    }
  })

  it('o profissional gravado é o da sessão, nunca o do formulário', async () => {
    await amendRecordAction({ ...input, authorId: 'outro-profissional' })

    expect(amend).toHaveBeenCalledWith(
      CLINIC,
      RECORD,
      'Texto corrigido.',
      AUTHOR,
      USER,
    )
  })
})

describe('o que a correção não muda', () => {
  it('paciente e atendimento não chegam a ser enviados', async () => {
    /*
     * O contrato de entrada é `recordId` e `content`. Paciente, tipo e vínculo
     * são herdados da versão anterior pelo adapter: corrigir o texto não pode,
     * por acidente, mudar de quem é o registro.
     */
    await amendRecordAction({
      ...input,
      patientId: 'outro-paciente',
      encounterId: 'outro-atendimento',
    })

    expect(amend).toHaveBeenCalledWith(
      CLINIC,
      RECORD,
      'Texto corrigido.',
      AUTHOR,
      USER,
    )
  })

  it('corrigir uma versão já corrigida é conflito, não erro genérico', async () => {
    // Duas correções sobre a mesma versão criariam um ramo paralelo, e o
    // prontuário passaria a ter duas "últimas versões".
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    amend.mockRejectedValue(
      new MedicalRecordRepositoryError('superseded', 'ja corrigido'),
    )

    const result = await amendRecordAction(input)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('conflict')
      expect(result.error.message).toBe(recordMessages.superseded)
    }

    spy.mockRestore()
  })
})

describe('as duas telas que leem a correção', () => {
  it('revalida a lista da clínica E a ficha do paciente', async () => {
    await amendRecordAction(input)

    const paths = revalidatePath.mock.calls.map((call) => call[0])

    expect(paths).toContain('/prontuarios')
    expect(paths).toContain(`/pacientes/${PATIENT}`)
  })

  it('a ficha vem do OUTPUT — o paciente nem chega ao servidor', async () => {
    /*
     * A entrada da correção não tem paciente. Quem o informa é a linha que o
     * repositório devolveu, herdada da versão anterior.
     */
    const other = '99999999-9999-4999-8999-999999999999'
    amend.mockResolvedValue(amendedRecord({ patientId: other }))

    await amendRecordAction(input)

    const paths = revalidatePath.mock.calls.map((call) => call[0])

    expect(paths).toContain(`/pacientes/${other}`)
    expect(paths).not.toContain(`/pacientes/${PATIENT}`)
  })
})

describe('a auditoria registra a correção, nunca o texto', () => {
  it('guarda a versão e qual ela substitui', async () => {
    await amendRecordAction(input)

    const event = recordAuditEvent.mock.calls[0][0] as {
      action: string
      before: Record<string, unknown>
      after: Record<string, unknown>
    }

    expect(event.action).toBe('record.amended')
    expect(event.before).toEqual({ superseded_id: PREVIOUS })
    expect(event.after).toEqual({ version: 2, patient_id: PATIENT })

    /*
     * `audit_log` é append-only e legível por `audit.read` — que `admin` tem e
     * `record.read` não. Nem o texto novo nem o antigo entram ali.
     */
    expect(JSON.stringify(event)).not.toContain('Texto corrigido')
    expect(JSON.stringify(event)).not.toContain('melhora da dor')
  })
})
