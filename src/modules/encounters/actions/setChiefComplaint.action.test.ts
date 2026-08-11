import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Queixa principal — feature **E-03**.
 *
 * **Não há banco, nem rede, nem Next em runtime.**
 *
 * As três coisas que esta action precisa acertar:
 *
 *  1. **A permissão é CLÍNICA.** As outras quatro actions do módulo pedem
 *     `encounter.write` — recepção inclusive. Esta pede `record.write`.
 *  2. **O texto não entra na auditoria.** É a informação mais sensível do
 *     módulo, e `audit_log` é legível por quem não tem `record.read`.
 *  3. **A queixa só viaja de volta para quem pode lê-la.**
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const ENCOUNTER = '9019956f-bdd8-4d61-868d-09b02332dad0'

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

const recordAuditEvent = vi.fn(
  async (event: unknown): Promise<{ recorded: false; reason: string }> => {
    void event
    return { recorded: false, reason: 'test' }
  },
)
vi.mock('@/lib/audit/audit-log', () => ({
  recordAuditEvent: (event: unknown) => recordAuditEvent(event),
}))

const setChiefComplaint = vi.fn()
vi.mock('../infrastructure/repository', () => ({
  encounterRepositoryFor: () => ({ setChiefComplaint }),
}))

const { setChiefComplaintAction } = await import('./setChiefComplaint.action')
const { encounterMessages } = await import('../schemas/encounter.schema')

function encounter(chiefComplaint: string | null = 'Dor torácica há 2 dias') {
  return {
    id: ENCOUNTER,
    patientId: '11111111-1111-4111-8111-111111111111',
    patientName: 'Marina Costa',
    professionalId: '22222222-2222-4222-8222-222222222222',
    professionalName: 'Dra. Helena',
    appointmentId: null,
    status: 'open' as const,
    chiefComplaint,
    startedAt: new Date('2026-08-10T13:00:00.000Z'),
    endedAt: null,
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
  setChiefComplaint.mockResolvedValue(encounter())
})

/**
 * A separação que dá sentido à fatia: quem opera a fila não é quem diz o que a
 * pessoa tem.
 */
describe('quem registra a queixa', () => {
  it.each(['owner', 'professional'])('%s registra', async (role) => {
    sessionState.mockResolvedValue(session(role))

    const result = await setChiefComplaintAction({
      encounterId: ENCOUNTER,
      chiefComplaint: 'Cefaleia há 3 dias',
    })

    expect(result.ok).toBe(true)
  })

  it.each(['receptionist', 'admin', 'finance'])('%s NÃO registra', async (role) => {
    /*
     * `receptionist` tem `encounter.write` — inicia e encerra atendimento — e
     * não tem `record.write`. `admin` administra a clínica e também não cuida do
     * paciente. É a matriz de I-05, e não uma escolha desta action.
     */
    sessionState.mockResolvedValue(session(role))

    const result = await setChiefComplaintAction({
      encounterId: ENCOUNTER,
      chiefComplaint: 'Cefaleia',
    })

    expect(result.ok).toBe(false)
    expect(setChiefComplaint).not.toHaveBeenCalled()
  })

  it('a clínica vem do contexto, nunca do formulário', async () => {
    await setChiefComplaintAction({
      encounterId: ENCOUNTER,
      chiefComplaint: 'Cefaleia',
      clinicId: 'outra-clinica',
    })

    expect(setChiefComplaint).toHaveBeenCalledWith(CLINIC, ENCOUNTER, 'Cefaleia')
  })
})

describe('normalização da entrada', () => {
  it('espaço nas pontas some', async () => {
    await setChiefComplaintAction({
      encounterId: ENCOUNTER,
      chiefComplaint: '  Cefaleia há 3 dias  ',
    })

    expect(setChiefComplaint).toHaveBeenCalledWith(
      CLINIC,
      ENCOUNTER,
      'Cefaleia há 3 dias',
    )
  })

  it('texto vazio vira null — apagar é correção legítima', async () => {
    // Sem isso, `''` ficaria no banco e a tela mostraria um campo "preenchido"
    // com nada dentro.
    await setChiefComplaintAction({ encounterId: ENCOUNTER, chiefComplaint: '   ' })

    expect(setChiefComplaint).toHaveBeenCalledWith(CLINIC, ENCOUNTER, null)
  })

  it('acima de 500 caracteres é recusado', async () => {
    const result = await setChiefComplaintAction({
      encounterId: ENCOUNTER,
      chiefComplaint: 'a'.repeat(501),
    })

    expect(result.ok).toBe(false)
    expect(setChiefComplaint).not.toHaveBeenCalled()
  })
})

/**
 * `audit_log` é append-only e legível pela operação inteira, incluindo papéis
 * sem `record.read`. Gravar o texto ali contornaria a própria filtragem que
 * esta fatia implementa.
 */
describe('trilha de auditoria', () => {
  it('o TEXTO da queixa não entra no evento', async () => {
    await setChiefComplaintAction({
      encounterId: ENCOUNTER,
      chiefComplaint: 'Dor torácica há 2 dias',
    })

    const event = recordAuditEvent.mock.calls[0][0]

    expect(JSON.stringify(event)).not.toContain('Dor torácica')
    expect(JSON.stringify(event)).not.toContain('torácica')
  })

  it('registra que houve registro, e se foi apagada', async () => {
    await setChiefComplaintAction({ encounterId: ENCOUNTER, chiefComplaint: '' })

    const event = recordAuditEvent.mock.calls[0][0] as {
      action: string
      entityId: string
      after: Record<string, unknown>
    }

    expect(event.action).toBe('encounter.chief_complaint_recorded')
    expect(event.entityId).toBe(ENCOUNTER)
    expect(event.after).toEqual({ cleared: true })
  })

  it('o nome do paciente também não entra', async () => {
    await setChiefComplaintAction({ encounterId: ENCOUNTER, chiefComplaint: 'Tosse' })

    expect(JSON.stringify(recordAuditEvent.mock.calls[0][0])).not.toContain('Marina')
  })
})

describe('recusas do banco chegam legíveis', () => {
  it('atendimento encerrado NÃO manda recarregar a tela', async () => {
    /*
     * `invalid-transition` nas outras actions significa "a fila andou" e a
     * mensagem manda atualizar. Aqui significa que a janela clínica fechou —
     * mandar recarregar faria a pessoa atualizar uma tela já correta.
     */
    const { EncounterRepositoryError } = await import(
      '../domain/EncounterRepositoryError'
    )
    setChiefComplaint.mockRejectedValue(
      new EncounterRepositoryError('invalid-transition', 'encerrado'),
    )

    const result = await setChiefComplaintAction({
      encounterId: ENCOUNTER,
      chiefComplaint: 'Tosse',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe(encounterMessages.chiefComplaintClosed)
      expect(result.error.message).not.toBe(encounterMessages.invalidTransition)
    }
  })

  it('recusa da policy fala em queixa, não em fila', async () => {
    const { EncounterRepositoryError } = await import(
      '../domain/EncounterRepositoryError'
    )
    setChiefComplaint.mockRejectedValue(
      new EncounterRepositoryError('forbidden', 'recusado', '42501'),
    )

    const result = await setChiefComplaintAction({
      encounterId: ENCOUNTER,
      chiefComplaint: 'Tosse',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe(encounterMessages.chiefComplaintForbidden)
    }
  })
})
