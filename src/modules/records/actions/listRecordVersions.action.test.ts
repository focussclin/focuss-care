import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A cadeia de versões de um registro.
 *
 * O que volta daqui é o TEXTO de cada versão anterior — conteúdo clínico. Três
 * coisas são provadas aqui: quem alcança, de qual clínica, e que o acesso fica
 * registrado com o alvo certo.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const AUTHOR = '55555555-5555-4555-8555-555555555555'
const PATIENT = '22222222-2222-4222-8222-222222222222'
const RECORD = '11111111-1111-4111-8111-111111111111'
const PREVIOUS = '33333333-3333-4333-8333-333333333333'

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

const listVersions = vi.fn()
const logAccess = vi.fn()
vi.mock('../infrastructure/repository', () => ({
  medicalRecordRepositoryFor: () => ({ listVersions, logAccess }),
}))

const { listRecordVersionsAction } = await import('./listRecordVersions.action')
const { recordMessages } = await import('../schemas/record.schema')

function version(overrides: Record<string, unknown> = {}) {
  return {
    id: RECORD,
    patientId: PATIENT,
    encounterId: null,
    encounter: null,
    authorId: AUTHOR,
    authorName: 'Dra. Helena',
    recordType: 'evolution' as const,
    content: 'Segunda versão: conduta ajustada.',
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

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.mockResolvedValue(session())
  logAccess.mockResolvedValue(undefined)
  listVersions.mockResolvedValue([
    version(),
    version({
      id: PREVIOUS,
      version: 1,
      supersedesId: null,
      content: 'Primeira versão: conduta inicial.',
      createdAt: new Date('2026-08-10T17:45:00.000Z'),
    }),
  ])
})

describe('quem lê as versões anteriores', () => {
  it.each(['owner', 'professional'])('%s lê', async (role) => {
    sessionState.mockResolvedValue(session(role))

    const result = await listRecordVersionsAction({ recordId: RECORD })

    expect(result.ok).toBe(true)
  })

  it.each(['admin', 'receptionist', 'finance'])('%s NÃO lê', async (role) => {
    /*
     * A versão anterior de uma evolução é tão clínica quanto a vigente.
     * `admin` administra a clínica e não cuida do paciente — a matriz de I-05 é
     * explícita, e um histórico aberto seria a porta lateral para o que
     * `/prontuarios` recusa na porta da frente.
     */
    sessionState.mockResolvedValue(session(role))

    const result = await listRecordVersionsAction({ recordId: RECORD })

    expect(result.ok).toBe(false)
    expect(listVersions).not.toHaveBeenCalled()
  })
})

describe('isolamento entre clínicas', () => {
  it('a clínica sai da sessão, nunca da entrada', async () => {
    await listRecordVersionsAction({
      recordId: RECORD,
      clinicId: 'outra-clinica',
    })

    expect(listVersions).toHaveBeenCalledWith(CLINIC, RECORD)
  })

  it('registro de outra clínica responde como inexistente', async () => {
    /*
     * O adapter filtra `clinic_id` em cada salto: um id de fora devolve cadeia
     * vazia. A action traduz isso para not-found, e a resposta fica idêntica à
     * de um id que nunca existiu — é o que impede a tela de virar sonda de
     * existência de registro alheio.
     */
    listVersions.mockResolvedValue([])

    const result = await listRecordVersionsAction({ recordId: RECORD })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('not-found')
      expect(result.error.message).toBe(recordMessages.notFound)
    }
  })

  it('id que não é uuid nem chega ao repositório', async () => {
    const result = await listRecordVersionsAction({ recordId: 'registro-1' })

    expect(result.ok).toBe(false)
    expect(listVersions).not.toHaveBeenCalled()
  })
})

describe('o que atravessa a fronteira', () => {
  it('as versões vêm da mais nova para a mais antiga, com data em ISO', async () => {
    const result = await listRecordVersionsAction({ recordId: RECORD })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.map((entry) => entry.version)).toEqual([2, 1])
      expect(result.data[0].createdAt).toBe('2026-08-11T09:00:00.000Z')
      expect(result.data[1].content).toBe('Primeira versão: conduta inicial.')
    }
  })
})

describe('a leitura é registrada', () => {
  it('com alvo próprio, e com o paciente que o banco devolveu', async () => {
    /*
     * `versions` separa este acesso do de abrir a ficha. Sem ele os dois
     * chegariam à trilha como "leu o prontuário deste paciente", e a pergunta
     * que se faz numa investigação — quem foi ver o que mudou num registro
     * corrigido — ficaria sem resposta.
     */
    await listRecordVersionsAction({ recordId: RECORD })

    expect(logAccess).toHaveBeenCalledWith(CLINIC, {
      target: 'versions',
      patientId: PATIENT,
    })
  })

  it('cadeia inexistente não registra acesso a paciente nenhum', async () => {
    listVersions.mockResolvedValue([])

    await listRecordVersionsAction({ recordId: RECORD })

    expect(logAccess).not.toHaveBeenCalled()
  })
})

describe('falha de leitura', () => {
  it('não vaza a mensagem do banco', async () => {
    /*
     * O erro do Postgres pode ecoar o valor consultado, e aqui o valor
     * consultado é o texto de uma evolução.
     */
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    listVersions.mockRejectedValue(
      new Error('content_text: paciente relatou dor lombar'),
    )

    const result = await listRecordVersionsAction({ recordId: RECORD })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe(recordMessages.versionsUnavailable)
    }

    expect(JSON.stringify(spy.mock.calls)).not.toContain('dor lombar')
    expect(logAccess).not.toHaveBeenCalled()

    spy.mockRestore()
  })
})
