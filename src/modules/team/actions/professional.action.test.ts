import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cadastrar profissional passa por duas portas.
 *
 * **Não há banco, nem rede, nem Next em runtime.**
 *
 *  1. **Papel** — `team.manage`. Vincular um usuário a um profissional é o que
 *     faz `current_professional_id()` resolver, e a partir daí essa pessoa
 *     assina prontuário e prescrição. Quem só consulta a equipe não decide isso.
 *  2. **Tenant do vínculo** — `professionals.user_id` referencia `profiles.id`,
 *     coluna única: o banco aceitaria qualquer usuário de qualquer clínica.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const OUTSIDER = 'a9b8c7d6-e5f4-4a3b-8c2d-1e0f9a8b7c6d'
const PROFESSIONAL = '11111111-1111-4111-8111-111111111111'

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
/*
 * A cota do plano entrou como colaborador destas actions (Q-01). Aqui ela e
 * sempre permissiva: este arquivo prova outra coisa, e deixar a leitura real
 * rodar contra o cliente falso faria estes casos falharem por um motivo que nao
 * e o deles.
 */
vi.mock('@/lib/subscription/plan-quota', () => ({
  hasQuotaFor: async () => ({ allowed: true, max: null }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => supabase,
}))

/*
 * O parametro precisa ser DECLARADO no `vi.fn`, e nao so recebido: sem ele,
 * `mock.calls` e tipado como `[]` e `calls[0][0]` nao existe para o typecheck.
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

const userBelongsToClinic = vi.fn()
const create = vi.fn()
const update = vi.fn()
const setActive = vi.fn()
vi.mock('../infrastructure/professional-repository', () => ({
  professionalRepositoryFor: () => ({ userBelongsToClinic, create, update, setActive }),
}))

const {
  createProfessionalAction,
  setProfessionalActiveAction,
  updateProfessionalAction,
} = await import('./professional.action')
const { professionalMessages } = await import('../schemas/professional.schema')

function professional(overrides: Record<string, unknown> = {}) {
  return {
    id: PROFESSIONAL,
    userId: USER,
    displayName: 'Dra. Helena Alves',
    councilType: 'CRM',
    councilNumber: '12345',
    councilState: 'SP',
    specialties: ['Clínica geral'],
    agendaColor: null,
    defaultSlotMinutes: 30,
    isActive: true,
    ...overrides,
  }
}

function session(role: string | null = 'admin') {
  return {
    status: 'active' as const,
    user: { id: USER, email: null, displayName: 'Teste', avatarUrl: null },
    clinicId: CLINIC,
    clinicName: null,
    role,
  }
}

const input = {
  displayName: 'Dra. Helena Alves',
  councilType: 'CRM',
  councilNumber: '12345',
  councilState: 'SP',
  specialties: 'Clínica geral',
  defaultSlotMinutes: '30',
  userId: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.mockResolvedValue(session())
  userBelongsToClinic.mockResolvedValue(true)
  create.mockResolvedValue(professional())
  update.mockResolvedValue(professional())
  setActive.mockResolvedValue(professional({ isActive: false }))
})

describe('quem gerencia profissionais', () => {
  it.each(['owner', 'admin'])('%s cadastra', async (role) => {
    sessionState.mockResolvedValue(session(role))

    const result = await createProfessionalAction(input)

    expect(result.ok).toBe(true)
  })

  it.each(['professional', 'receptionist', 'finance'])('%s NÃO cadastra', async (role) => {
    /*
     * `team.manage`. Um profissional que pudesse se cadastrar — ou editar o
     * próprio vínculo — escolheria quem assina prontuário nesta clínica.
     */
    sessionState.mockResolvedValue(session(role))

    const result = await createProfessionalAction(input)

    expect(result.ok).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })

  it('desativar exige o mesmo papel', async () => {
    sessionState.mockResolvedValue(session('receptionist'))

    const result = await setProfessionalActiveAction({
      professionalId: PROFESSIONAL,
      isActive: false,
    })

    expect(result.ok).toBe(false)
    expect(setActive).not.toHaveBeenCalled()
  })
})

/**
 * A guarda que a FK de coluna única não dá.
 */
describe('isolamento entre clínicas no vínculo', () => {
  it('o usuário escolhido é conferido contra a clínica da sessão', async () => {
    await createProfessionalAction({ ...input, userId: USER })

    expect(userBelongsToClinic).toHaveBeenCalledWith(CLINIC, USER)
  })

  it('usuário de fora não é vinculado', async () => {
    /*
     * Aceitá-lo daria a alguém de outra clínica a assinatura clínica daqui —
     * `current_professional_id()` passaria a resolver para essa pessoa.
     */
    userBelongsToClinic.mockResolvedValue(false)

    const result = await createProfessionalAction({ ...input, userId: OUTSIDER })

    expect(result.ok).toBe(false)
    expect(create).not.toHaveBeenCalled()
    if (!result.ok) {
      expect(result.error.message).toBe(professionalMessages.userNotInClinic)
      expect(result.error.fieldErrors?.userId).toBe(professionalMessages.userNotInClinic)
    }
  })

  it('a edição passa pela mesma guarda', async () => {
    // O caminho mais fácil de esquecer: criar limpo e trocar o vínculo depois.
    userBelongsToClinic.mockResolvedValue(false)

    const result = await updateProfessionalAction({
      professionalId: PROFESSIONAL,
      ...input,
      userId: OUTSIDER,
    })

    expect(result.ok).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })

  it('sem vínculo escolhido, não consulta nada', async () => {
    // Cadastro sem usuário é o caso normal — quem atende antes de ter conta.
    await createProfessionalAction({ ...input, userId: '' })

    expect(userBelongsToClinic).not.toHaveBeenCalled()
    expect(create).toHaveBeenCalled()
  })

  it('a clínica vem do contexto, nunca do formulário', async () => {
    await createProfessionalAction({ ...input, clinicId: 'outra-clinica' })

    expect(create).toHaveBeenCalledWith(CLINIC, expect.anything())
  })
})

describe('o que chega ao repositório', () => {
  it('especialidades viram lista e a UF sobe para maiúscula', async () => {
    await createProfessionalAction({
      ...input,
      councilState: 'rj',
      specialties: 'Cardiologia, Clínica geral',
    })

    expect(create).toHaveBeenCalledWith(CLINIC, {
      displayName: 'Dra. Helena Alves',
      councilType: 'CRM',
      councilNumber: '12345',
      councilState: 'RJ',
      specialties: ['Cardiologia', 'Clínica geral'],
      defaultSlotMinutes: 30,
      userId: null,
      agendaColor: null,
    })
  })

  it('conselho incompleto não chega ao banco', async () => {
    const result = await createProfessionalAction({ ...input, councilState: '' })

    expect(result.ok).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })
})

/**
 * `audit_log` é append-only e legível pela operação inteira: o que entra ali
 * não sai mais.
 */
describe('trilha de auditoria', () => {
  it('registra o alcance da assinatura, e não o nome', async () => {
    await createProfessionalAction({ ...input, userId: USER })

    const event = recordAuditEvent.mock.calls[0][0] as {
      action: string
      after: Record<string, unknown>
    }

    expect(event.action).toBe('professional.created')
    expect(event.after).toEqual({
      council_type: 'CRM',
      linked_user: true,
      can_sign: true,
    })
    expect(JSON.stringify(event)).not.toContain('Helena')
  })

  it('desativar e reativar são eventos distintos', async () => {
    await setProfessionalActiveAction({ professionalId: PROFESSIONAL, isActive: false })

    const event = recordAuditEvent.mock.calls[0][0] as { action: string }
    expect(event.action).toBe('professional.deactivated')
  })
})

describe('falhas do banco chegam legíveis', () => {
  it('recusa de escrita diz que falta policy', async () => {
    const { ProfessionalError } = await import('../domain/ProfessionalRepository')
    setActive.mockRejectedValue(new ProfessionalError('write-forbidden', 'recusado'))

    const result = await setProfessionalActiveAction({
      professionalId: PROFESSIONAL,
      isActive: false,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe(professionalMessages.writeForbidden)
  })

  it('usuário já vinculado vira conflito, não erro genérico', async () => {
    const { ProfessionalError } = await import('../domain/ProfessionalRepository')
    create.mockRejectedValue(
      new ProfessionalError('user-already-linked', 'duplicado', '23505'),
    )

    const result = await createProfessionalAction({ ...input, userId: USER })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('conflict')
      expect(result.error.message).toBe(professionalMessages.userAlreadyLinked)
    }
  })
})
