import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A busca do seletor de paciente, pelo pipeline real.
 *
 * **Nao ha banco, nem rede, nem Next em runtime.** Sessao, cliente Supabase e o
 * repositorio sao mocks — mesmo desenho de `patientConsent.action.test.ts`. O
 * que se verifica aqui e o que o pipeline decide sozinho:
 *
 *  - a clinica consultada e a da SESSAO, mesmo quando a entrada manda outra;
 *  - sessao sem papel na clinica ativa nao busca;
 *  - o limite e o do servidor, e o cliente nao consegue troca-lo;
 *  - a resposta carrega id e nome, e mais nada;
 *  - recusa do banco vira mensagem generica, sem detalhe de Postgres.
 *
 * Tenancy de verdade continua sendo pgTAP no banco (R1 do roadmap): aqui se
 * prova que a APLICACAO nunca chega a pedir a clinica errada.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const OTHER_CLINIC = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'

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

const recordAuditEvent = vi.fn(async () => ({
  recorded: false as const,
  reason: 'test',
}))
vi.mock('@/lib/audit/audit-log', () => ({
  recordAuditEvent: (...args: unknown[]) => recordAuditEvent(...(args as [])),
}))

const listPage = vi.fn()
vi.mock('../infrastructure/repository', () => ({
  patientRepositoryFor: () => ({ listPage }),
}))

const { searchPatientsAction } = await import('./searchPatients.action')
const { PICKER_RESULT_LIMIT, patientPickerMessages } = await import(
  '../schemas/patientPicker.schema'
)
const { PatientRepositoryError } = await import(
  '../domain/PatientRepositoryError'
)

function activeSession(role: string | null = 'receptionist') {
  return {
    status: 'active' as const,
    user: { id: USER, email: null, displayName: 'Teste', avatarUrl: null },
    clinicId: CLINIC,
    clinicName: null,
    role,
  }
}

function patient(id: string, name: string) {
  return {
    id,
    name,
    phone: '11999990000',
    email: 'maria@exemplo.com',
    document: '12345678901',
    birthDate: new Date('1990-01-01'),
    status: 'active' as const,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.mockResolvedValue(activeSession())
  listPage.mockResolvedValue({
    items: [patient('p-1', 'Maria Silva')],
    nextCursor: null,
  })
})

// ---------------------------------------------------------------------------

describe('o que o servidor decide sozinho', () => {
  it('consulta a clinica da SESSAO, mesmo quando a entrada manda outra', async () => {
    const result = await searchPatientsAction({
      query: 'maria',
      clinicId: OTHER_CLINIC,
    })

    expect(result.ok).toBe(true)
    expect(listPage).toHaveBeenCalledTimes(1)
    expect(listPage.mock.calls[0][0]).toBe(CLINIC)
    expect(JSON.stringify(listPage.mock.calls[0])).not.toContain(OTHER_CLINIC)
  })

  it('impoe o limite do seletor, e o cliente nao o aumenta', async () => {
    await searchPatientsAction({ query: 'maria', limit: 10_000 })

    expect(listPage.mock.calls[0][1]).toMatchObject({
      limit: PICKER_RESULT_LIMIT,
      cursor: null,
    })
  })

  it('busca so paciente ativo — nao se marca consulta para arquivado', async () => {
    await searchPatientsAction({ query: 'maria', status: 'all' })

    expect(listPage.mock.calls[0][1]).toMatchObject({ status: 'active' })
  })

  it('manda ao repositorio o termo ja higienizado', async () => {
    await searchPatientsAction({ query: '  ma%ri_a  ' })

    expect(listPage.mock.calls[0][1]).toMatchObject({ search: 'maria' })
  })
})

describe('quem pode buscar', () => {
  it('recusa sessao sem papel na clinica ativa', async () => {
    sessionState.mockResolvedValue(activeSession(null))

    const result = await searchPatientsAction({ query: 'maria' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('forbidden')
      expect(result.error.message).toBe(patientPickerMessages.forbidden)
    }
    expect(listPage).not.toHaveBeenCalled()
  })

  it('recusa visitante anonimo', async () => {
    sessionState.mockResolvedValue({ status: 'anonymous' as const })

    const result = await searchPatientsAction({ query: 'maria' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('unauthenticated')
    expect(listPage).not.toHaveBeenCalled()
  })

  it('recusa sessao autenticada sem clinica ativa', async () => {
    sessionState.mockResolvedValue({ status: 'needs-onboarding' as const })

    const result = await searchPatientsAction({ query: 'maria' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('no-active-clinic')
    expect(listPage).not.toHaveBeenCalled()
  })

  it.each(['owner', 'admin', 'professional', 'receptionist', 'finance'])(
    'aceita %s, que tem patient.read',
    async (role) => {
      sessionState.mockResolvedValue(activeSession(role))

      const result = await searchPatientsAction({ query: 'maria' })

      expect(result.ok).toBe(true)
    },
  )
})

describe('o que volta para o cliente', () => {
  it('devolve id e nome, e nenhum outro dado pessoal', async () => {
    listPage.mockResolvedValue({
      items: [patient('p-1', 'Maria Silva')],
      nextCursor: null,
    })

    const result = await searchPatientsAction({ query: 'maria' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual([{ id: 'p-1', name: 'Maria Silva' }])

      const wire = JSON.stringify(result.data)
      expect(wire).not.toContain('11999990000')
      expect(wire).not.toContain('maria@exemplo.com')
      expect(wire).not.toContain('12345678901')
    }
  })

  it('termo curto nem chega ao repositorio', async () => {
    const result = await searchPatientsAction({ query: 'a' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('validation')
      expect(result.error.fieldErrors?.query).toBe(
        patientPickerMessages.queryTooShort,
      )
    }
    expect(listPage).not.toHaveBeenCalled()
  })

  it('recusa do banco vira mensagem generica, sem detalhe de Postgres', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    listPage.mockRejectedValue(
      new PatientRepositoryError(
        'forbidden',
        'permission denied for table patients',
        '42501',
      ),
    )

    const result = await searchPatientsAction({ query: 'maria' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe(patientPickerMessages.unavailable)
      expect(result.error.message).not.toContain('42501')
    }

    // O termo buscado e o nome de uma pessoa: nao vai para o log.
    expect(JSON.stringify(spy.mock.calls)).not.toContain('maria')
    spy.mockRestore()
  })
})

describe('o que uma LEITURA nao faz', () => {
  it('nao invalida cache nem revalida rota', async () => {
    await searchPatientsAction({ query: 'maria' })

    expect(updateTag).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('nao audita — trilha de auditoria e para prontuario, nao para tecla digitada', async () => {
    await searchPatientsAction({ query: 'maria' })

    expect(recordAuditEvent).not.toHaveBeenCalled()
  })
})
