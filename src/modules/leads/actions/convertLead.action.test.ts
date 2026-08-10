import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A conversão do lead em paciente, pelo pipeline real.
 *
 * **Não há banco, nem rede, nem Next em runtime.** O que se verifica é o que o
 * `createAction` decide sozinho — e, aqui, uma decisão que vale mais que as
 * outras: **a permissão é `patient.write`, e não `team.read`**.
 *
 * As outras três actions do módulo pedem `team.read` porque mexem no funil.
 * Esta cria uma FICHA DE PACIENTE, que é cadastro clínico: quem não pode
 * cadastrar paciente pela tela de pacientes não pode cadastrar pelo CRM.
 * Manter `team.read` seria uma porta lateral para o mesmo efeito.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const OTHER_CLINIC = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const LEAD = '11111111-1111-4111-8111-111111111111'
const PATIENT = '33333333-3333-4333-8333-333333333333'

const updateTag = vi.fn<(tag: string) => void>()
const revalidatePath = vi.fn<(path: string) => void>()

vi.mock('next/cache', () => ({
  updateTag: (tag: string) => updateTag(tag),
  revalidatePath: (path: string) => revalidatePath(path),
}))

vi.mock('next/server', () => ({
  after: (callback: () => unknown) => {
    void callback()
  },
}))

vi.mock('next/navigation', () => ({ unstable_rethrow: () => {} }))

const sessionState = vi.fn()
vi.mock('@/lib/auth/session', () => ({
  getSessionState: () => sessionState(),
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

const convert = vi.fn()
vi.mock('../infrastructure/repository', () => ({
  leadRepositoryFor: () => ({ convert }),
}))

const { convertLeadAction } = await import('./convertLead.action')
const { leadMessages } = await import('../schemas/lead.schema')
const { LeadRepositoryError } = await import('../domain/LeadRepositoryError')

function activeSession(role: string | null = 'receptionist') {
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
  sessionState.mockResolvedValue(activeSession())
  convert.mockResolvedValue({ patientId: PATIENT })
})

describe('quem pode converter', () => {
  it.each(['owner', 'admin', 'professional', 'receptionist'])(
    '%s converte',
    async (role) => {
      sessionState.mockResolvedValue(activeSession(role))

      const result = await convertLeadAction({ leadId: LEAD })

      expect(result.ok).toBe(true)
    },
  )

  it('finance NÃO converte, mesmo tendo acesso ao CRM', async () => {
    /*
     * A distinção que dá nome a este arquivo. Converter cria ficha clínica, e
     * `finance` não tem `patient.write` — a matriz diz que ele alcança
     * cobrança, não cadastro de paciente.
     */
    sessionState.mockResolvedValue(activeSession('finance'))

    const result = await convertLeadAction({ leadId: LEAD })

    expect(result.ok).toBe(false)
    expect(convert).not.toHaveBeenCalled()
  })

  it('sessão sem papel não converte', async () => {
    sessionState.mockResolvedValue(activeSession(null))

    const result = await convertLeadAction({ leadId: LEAD })

    expect(result.ok).toBe(false)
    expect(convert).not.toHaveBeenCalled()
  })
})

describe('o que o servidor decide sozinho', () => {
  it('usa a clínica da SESSÃO, mesmo quando a entrada manda outra', async () => {
    await convertLeadAction({ leadId: LEAD, clinicId: OTHER_CLINIC })

    expect(convert).toHaveBeenCalledWith(CLINIC, LEAD)
  })

  it('id malformado nem chega ao repositório', async () => {
    const result = await convertLeadAction({ leadId: 'lead-1' })

    expect(result.ok).toBe(false)
    expect(convert).not.toHaveBeenCalled()
  })

  it('dado de paciente na entrada é descartado', async () => {
    /*
     * Nome e telefone saem da linha do lead, dentro da função do banco.
     * Aceitá-los aqui criaria um paciente com dados que nunca estiveram no
     * funil — e a conversão deixaria de ser conversão.
     */
    const result = await convertLeadAction({
      leadId: LEAD,
      name: 'Outra Pessoa',
      phone: '11999990000',
    })

    expect(result.ok).toBe(true)
    expect(convert).toHaveBeenCalledWith(CLINIC, LEAD)
  })
})

describe('revalidação', () => {
  it('revalida o funil E a ficha do paciente novo', async () => {
    /*
     * A ficha passou a existir; sem revalidá-la, o link "ver ficha" levaria a
     * uma página que o cache ainda não conhece.
     *
     * O id sai do `output` — do banco, depois da RLS —, e nunca da entrada.
     */
    await convertLeadAction({ leadId: LEAD })

    const caminhos = revalidatePath.mock.calls.map(([path]) => path)

    expect(caminhos).toContain('/crm')
    expect(caminhos.some((path) => path.includes(PATIENT))).toBe(true)
  })
})

describe('recusas', () => {
  it('lead já convertido diz para abrir a ficha, e não "tente de novo"', async () => {
    convert.mockRejectedValue(
      new LeadRepositoryError('already-converted', 'já convertido', '23505'),
    )

    const result = await convertLeadAction({ leadId: LEAD })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe(leadMessages.alreadyConverted)
      expect(result.error.code).toBe('conflict')
    }
  })

  it('migration pendente diz que é migration', async () => {
    convert.mockRejectedValue(
      new LeadRepositoryError('schema-not-ready', 'função ausente', '42883'),
    )

    const result = await convertLeadAction({ leadId: LEAD })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe(leadMessages.schemaPending)
  })

  it('nenhuma mensagem carrega detalhe de Postgres', async () => {
    convert.mockRejectedValue(
      new LeadRepositoryError(
        'unexpected',
        'null value in column "biological_sex" violates not-null constraint',
        '23502',
      ),
    )

    const result = await convertLeadAction({ leadId: LEAD })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe(leadMessages.unexpected)
      expect(result.error.message).not.toMatch(/constraint|column/i)
    }
  })
})

describe('auditoria', () => {
  it('liga o lead ao paciente criado', async () => {
    /*
     * Sem o id do paciente, "convertido" não diz EM QUEM — e a trilha perde
     * justamente o fio que liga as duas pontas da operação.
     */
    await convertLeadAction({ leadId: LEAD })

    const evento = recordAuditEvent.mock.calls[0][0] as unknown as {
      action: string
      entityId: string
      after: Record<string, unknown>
    }

    expect(evento.action).toBe('lead.converted')
    expect(evento.entityId).toBe(LEAD)
    expect(evento.after).toMatchObject({ converted_patient_id: PATIENT })
  })
})
