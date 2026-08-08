import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * As duas Server Actions de consentimento (P-03), pelo pipeline real.
 *
 * **Nao ha banco, nem rede, nem Next em runtime.** Sessao, cliente Supabase,
 * auditoria, cache e os repositorios sao mocks — mesmo desenho de
 * `_shared/application/createAction.test.ts`. O que este arquivo verifica sao as
 * decisoes que o pipeline toma antes e depois do caso de uso:
 *
 *  - papel sem `patient.write` nao escreve;
 *  - a clinica gravada e a da SESSAO, mesmo quando a entrada manda outra;
 *  - a versao do documento vem do servidor, mesmo quando a entrada manda outra;
 *  - a tag invalidada carrega `clinic_id`;
 *  - o evento de auditoria nao carrega dado pessoal;
 *  - toda recusa vira mensagem generica, sem detalhe de banco.
 *
 * Tenancy real continua sendo pgTAP no banco (R1 do roadmap).
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const OTHER_CLINIC = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'
const PATIENT = '9019956f-bdd8-4d61-868d-09b02332dad0'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const CONSENT = '11111111-1111-4111-8111-111111111111'

const updateTag = vi.fn<(tag: string) => void>()
const revalidatePath = vi.fn<(path: string) => void>()

vi.mock('next/cache', () => ({
  updateTag: (tag: string) => updateTag(tag),
  revalidatePath: (path: string) => revalidatePath(path),
}))

// `after()` roda o callback depois da resposta. Sincrono aqui para que a
// auditoria (best-effort) nao vaze do teste como promessa pendente.
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

const findById = vi.fn()
const listByPatient = vi.fn()
const grant = vi.fn()
const revokeActive = vi.fn()

vi.mock('../infrastructure/repository', () => ({
  patientRepositoryFor: () => ({ findById }),
  patientConsentRepositoryFor: () => ({ listByPatient, grant, revokeActive }),
}))

const { grantPatientConsentAction } = await import(
  './grantPatientConsent.action'
)
const { revokePatientConsentAction } = await import(
  './revokePatientConsent.action'
)
const { PatientRepositoryError } = await import(
  '../domain/PatientRepositoryError'
)

function activeSession(role = 'owner', clinicId = CLINIC) {
  return {
    status: 'active' as const,
    user: { id: USER, email: null, displayName: 'Teste', avatarUrl: null },
    clinicId,
    clinicName: null,
    role,
  }
}

function consentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONSENT,
    purpose: 'health_data_processing',
    documentVersion: '2026-08.v1',
    grantedAt: new Date('2026-08-07T12:00:00.000Z'),
    revokedAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.mockResolvedValue(activeSession())
  findById.mockResolvedValue({ id: PATIENT, name: 'Maria' })
  listByPatient.mockResolvedValue([])
  grant.mockResolvedValue(consentRow())
  revokeActive.mockResolvedValue([
    consentRow({ revokedAt: new Date('2026-08-09T10:00:00.000Z') }),
  ])
})

// ---------------------------------------------------------------------------

describe('conceder — o que o servidor decide sozinho', () => {
  it('grava a versao do servidor, ignorando a que o cliente mandou', async () => {
    const result = await grantPatientConsentAction({
      patientId: PATIENT,
      purpose: 'health_data_processing',
      documentVersion: '9999-99.v9',
    })

    expect(result.ok).toBe(true)
    expect(grant).toHaveBeenCalledTimes(1)

    const [clinicId, patientId, data] = grant.mock.calls[0]
    expect(clinicId).toBe(CLINIC)
    expect(patientId).toBe(PATIENT)
    expect(data.documentVersion).toBe('2026-08.v1')
    expect(data.documentVersion).not.toBe('9999-99.v9')
    expect(data.purpose).toBe('health_data_processing')
    expect(data.grantedAt).toBeInstanceOf(Date)
  })

  it('grava na clinica da SESSAO, mesmo quando a entrada manda outra', async () => {
    await grantPatientConsentAction({
      patientId: PATIENT,
      purpose: 'privacy_policy',
      clinicId: OTHER_CLINIC,
    })

    expect(grant.mock.calls[0][0]).toBe(CLINIC)
    expect(findById.mock.calls[0][0]).toBe(CLINIC)
    expect(JSON.stringify(grant.mock.calls[0])).not.toContain(OTHER_CLINIC)
  })

  it('invalida a tag do paciente, com a clinica dentro dela', async () => {
    await grantPatientConsentAction({
      patientId: PATIENT,
      purpose: 'terms_of_service',
    })

    expect(updateTag).toHaveBeenCalledExactlyOnceWith(
      `clinic:${CLINIC}:patient:${PATIENT}`,
    )
    // A listagem nao mostra consentimento: invalida-la derrubaria cache alheio.
    expect(updateTag).not.toHaveBeenCalledWith(`clinic:${CLINIC}:patients`)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('devolve so os seis campos do DTO', async () => {
    const result = await grantPatientConsentAction({
      patientId: PATIENT,
      purpose: 'health_data_processing',
    })

    expect(result.ok && Object.keys(result.data).sort()).toEqual([
      'documentVersion',
      'grantedAt',
      'id',
      'isActive',
      'purpose',
      'revokedAt',
    ])
    expect(JSON.stringify(result)).not.toContain(CLINIC)
  })
})

describe('conceder — auditoria', () => {
  it('registra finalidade e versao, e nao registra o paciente', async () => {
    await grantPatientConsentAction({
      patientId: PATIENT,
      purpose: 'ai_assisted_processing',
    })

    expect(recordAuditEvent).toHaveBeenCalledTimes(1)
    const [event] = recordAuditEvent.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ]

    expect(event).toMatchObject({
      action: 'patient.consent.granted',
      entityType: 'consent',
      entityId: CONSENT,
    })

    const serialized = JSON.stringify(event)
    // Nem o id do paciente nem o nome dele: o vinculo vive em
    // `consents.subject_id`, alcancavel pelo `entityId`.
    expect(serialized).not.toContain(PATIENT)
    expect(serialized).not.toContain('Maria')
    expect(serialized).not.toContain(CLINIC)
  })

  it('a auditoria nao derruba a escrita', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    recordAuditEvent.mockRejectedValueOnce(new Error('audit fora do ar'))

    const result = await grantPatientConsentAction({
      patientId: PATIENT,
      purpose: 'privacy_policy',
    })

    expect(result.ok).toBe(true)
    consoleError.mockRestore()
  })
})

describe('conceder — recusas', () => {
  it('papel sem patient.write nao chega ao repositorio', async () => {
    sessionState.mockResolvedValue(activeSession('finance'))

    const result = await grantPatientConsentAction({
      patientId: PATIENT,
      purpose: 'privacy_policy',
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(findById).not.toHaveBeenCalled()
    expect(grant).not.toHaveBeenCalled()
  })

  it('finalidade fora do enum nao chega ao repositorio', async () => {
    const result = await grantPatientConsentAction({
      patientId: PATIENT,
      purpose: 'tudo',
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'validation' } })
    expect(grant).not.toHaveBeenCalled()
  })

  it('paciente inexistente ou de outra clinica devolve a mesma coisa', async () => {
    findById.mockResolvedValue(null)

    const result = await grantPatientConsentAction({
      patientId: PATIENT,
      purpose: 'privacy_policy',
    })

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'not-found',
        message: 'Este paciente não está mais disponível nesta clínica.',
      },
    })
    expect(grant).not.toHaveBeenCalled()
  })

  it('consentimento ja vigente vira conflito, sem gravar linha nova', async () => {
    listByPatient.mockResolvedValue([
      consentRow({ purpose: 'privacy_policy', revokedAt: null }),
    ])

    const result = await grantPatientConsentAction({
      patientId: PATIENT,
      purpose: 'privacy_policy',
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'conflict' } })
    expect(grant).not.toHaveBeenCalled()
  })

  it('registro revogado da mesma finalidade nao bloqueia um novo consentimento', async () => {
    listByPatient.mockResolvedValue([
      consentRow({
        purpose: 'privacy_policy',
        revokedAt: new Date('2026-08-01T10:00:00.000Z'),
      }),
    ])

    const result = await grantPatientConsentAction({
      patientId: PATIENT,
      purpose: 'privacy_policy',
    })

    expect(result.ok).toBe(true)
    expect(grant).toHaveBeenCalledTimes(1)
  })

  it('falha de conexao vira mensagem generica, sem detalhe de banco', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    grant.mockRejectedValue(
      new PatientRepositoryError('unavailable', 'fetch failed to db.supabase.co'),
    )

    const result = await grantPatientConsentAction({
      patientId: PATIENT,
      purpose: 'privacy_policy',
    })

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'unavailable',
        message: 'Não foi possível falar com o servidor agora. Tente novamente.',
      },
    })
    expect(JSON.stringify(result)).not.toContain('supabase.co')
    expect(updateTag).not.toHaveBeenCalled()

    consoleError.mockRestore()
  })

  it('recusa da RLS vira "sem permissao", sem citar policy', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    grant.mockRejectedValue(
      new PatientRepositoryError(
        'forbidden',
        'new row violates row-level security policy for table "consents"',
        '42501',
      ),
    )

    const result = await grantPatientConsentAction({
      patientId: PATIENT,
      purpose: 'privacy_policy',
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(JSON.stringify(result)).not.toContain('row-level security')

    consoleError.mockRestore()
  })

  it('sessao sem clinica ativa nao escreve nada', async () => {
    sessionState.mockResolvedValue({
      status: 'needs-onboarding',
      user: { id: USER, email: null, displayName: 'Teste', avatarUrl: null },
    })

    const result = await grantPatientConsentAction({
      patientId: PATIENT,
      purpose: 'privacy_policy',
    })

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'no-active-clinic' },
    })
    expect(findById).not.toHaveBeenCalled()
  })

  it('Supabase nao configurado responde indisponivel, nunca "salvo"', async () => {
    sessionState.mockResolvedValue({ status: 'not-configured' })

    const result = await grantPatientConsentAction({
      patientId: PATIENT,
      purpose: 'privacy_policy',
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'unavailable' } })
    expect(grant).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------

describe('revogar', () => {
  it('carimba a revogacao no paciente e finalidade pedidos, na clinica da sessao', async () => {
    const result = await revokePatientConsentAction({
      patientId: PATIENT,
      purpose: 'health_data_processing',
      clinicId: OTHER_CLINIC,
    })

    expect(result.ok).toBe(true)
    const [clinicId, patientId, purpose, revokedAt] = revokeActive.mock.calls[0]

    expect(clinicId).toBe(CLINIC)
    expect(patientId).toBe(PATIENT)
    expect(purpose).toBe('health_data_processing')
    expect(revokedAt).toBeInstanceOf(Date)
    expect(result.ok && result.data.isActive).toBe(false)
  })

  it('invalida a tag do paciente', async () => {
    await revokePatientConsentAction({
      patientId: PATIENT,
      purpose: 'health_data_processing',
    })

    expect(updateTag).toHaveBeenCalledExactlyOnceWith(
      `clinic:${CLINIC}:patient:${PATIENT}`,
    )
  })

  it('nada vigente vira conflito — a tela que originou o clique esta velha', async () => {
    revokeActive.mockResolvedValue([])

    const result = await revokePatientConsentAction({
      patientId: PATIENT,
      purpose: 'marketing_communication',
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'conflict' } })
    expect(updateTag).not.toHaveBeenCalled()
  })

  it('audita quantas linhas vigentes foram fechadas', async () => {
    // Mais de uma revela a corrida sem indice unico (§9.5 de docs/07).
    revokeActive.mockResolvedValue([
      consentRow({ revokedAt: new Date('2026-08-09T10:00:00.000Z') }),
      consentRow({ id: 'duplicada', revokedAt: new Date('2026-08-09T10:00:00.000Z') }),
    ])

    await revokePatientConsentAction({
      patientId: PATIENT,
      purpose: 'health_data_processing',
    })

    const [event] = recordAuditEvent.mock.calls[0] as unknown as [
      { action: string; after: Record<string, unknown> },
    ]

    expect(event.action).toBe('patient.consent.revoked')
    expect(event.after.revoked_count).toBe(2)
    expect(JSON.stringify(event)).not.toContain(PATIENT)
  })

  it('papel sem patient.write nao revoga', async () => {
    sessionState.mockResolvedValue(activeSession('finance'))

    const result = await revokePatientConsentAction({
      patientId: PATIENT,
      purpose: 'health_data_processing',
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'forbidden' } })
    expect(revokeActive).not.toHaveBeenCalled()
  })

  it('paciente inexistente nao revoga nada', async () => {
    findById.mockResolvedValue(null)

    const result = await revokePatientConsentAction({
      patientId: PATIENT,
      purpose: 'health_data_processing',
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'not-found' } })
    expect(revokeActive).not.toHaveBeenCalled()
  })

  it('paciente que nao e uuid nao chega ao repositorio', async () => {
    const result = await revokePatientConsentAction({
      patientId: 'nao-e-uuid',
      purpose: 'health_data_processing',
    })

    expect(result).toMatchObject({ ok: false, error: { code: 'validation' } })
    expect(findById).not.toHaveBeenCalled()
  })
})
