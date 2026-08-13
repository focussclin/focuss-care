import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

/**
 * Contrato de revalidacao do `createAction` (F-02).
 *
 * O que este arquivo verifica e SO isto: que as tags invalidadas depois de uma
 * escrita carregam a clinica do servidor, e que nao ha caminho pelo qual a
 * entrada do formulario as influencie.
 *
 * **Nao ha banco, nem rede, nem Next em runtime.** Sessao, cliente Supabase,
 * auditoria e as funcoes de cache do Next sao substituidos por mocks. Rodar o
 * pipeline de verdade exigiria contexto de request do Next; o que importa aqui e
 * a decisao que o pipeline toma, e ela e verificavel sem isso.
 *
 * Tenancy real continua sendo pgTAP no banco (R1 do roadmap) — nenhum teste em
 * Node prova RLS.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const OTHER_CLINIC = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'
const PATIENT = '9019956f-bdd8-4d61-868d-09b02332dad0'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'

const updateTag = vi.fn<(tag: string) => void>()
const revalidatePath = vi.fn<(path: string) => void>()

vi.mock('next/cache', () => ({
  updateTag: (tag: string) => updateTag(tag),
  revalidatePath: (path: string) => revalidatePath(path),
}))

// `after()` roda o callback depois da resposta. Aqui ele e sincrono para que a
// auditoria (best-effort) nao vaze para fora do teste como promessa pendente.
vi.mock('next/server', () => ({
  after: (callback: () => unknown) => {
    void callback()
  },
}))

vi.mock('next/navigation', () => ({
  unstable_rethrow: () => {},
}))

const sessionState = vi.fn()
vi.mock('@/lib/auth/session', () => ({
  getSessionState: () => sessionState(),
}))

/**
 * Nivel de garantia da sessao (AAL).
 *
 * Por padrao `aal1`/`aal1`: conta sem segundo fator cadastrado, que e o caso da
 * maioria dos testes deste arquivo. Quem testa o portao sobrescreve.
 */
const assuranceLevel = vi.fn()

// Cliente marcado, nao funcional: o handler dos testes nunca consulta nada. O
// `auth.mfa` existe porque o pipeline le o AAL antes de autorizar o papel.
const supabase = {
  __fake: true,
  auth: { mfa: { getAuthenticatorAssuranceLevel: () => assuranceLevel() } },
}
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => supabase,
}))

const recordAuditEvent = vi.fn(async () => ({ recorded: false as const, reason: 'test' }))
vi.mock('@/lib/audit/audit-log', () => ({
  recordAuditEvent: (...args: unknown[]) => recordAuditEvent(...(args as [])),
}))

const { cacheTags } = await import('@/lib/cache/tags')
const { createAction } = await import('./createAction')
const { ok } = await import('../domain/Result')

function activeSession(
  clinicId = CLINIC,
  clinicStatus: 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled' = 'active',
) {
  return {
    status: 'active' as const,
    user: { id: USER, email: null, displayName: 'Teste', avatarUrl: null },
    clinicId,
    clinicName: null,
    /** `clinics.status` — o estado COMERCIAL, distinto do estado da sessao. */
    clinicStatus,
    role: 'owner' as const,
  }
}

/** Action minima: recebe um nome livre, devolve um id que o "banco" escolheu. */
function patientAction(
  overrides: Partial<Parameters<typeof createAction<{ name: string }, { id: string }>>[0]> = {},
) {
  return createAction<{ name: string }, { id: string }>({
    name: 'patient.test',
    schema: z.object({ name: z.string() }),
    handler: async () => ok({ id: PATIENT }),
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.mockResolvedValue(activeSession())
  assuranceLevel.mockResolvedValue({
    data: { currentLevel: 'aal1', nextLevel: 'aal1' },
    error: null,
  })
})

describe('efeitos pÃ³s-sucesso', () => {
  it('executa o efeito com contexto derivado da sessÃ£o, sem expor a entrada crua', async () => {
    const afterSuccess = vi.fn(async () => {})
    const action = patientAction({ afterSuccess })

    const result = await action({ name: 'Maria' })

    expect(result).toEqual({ ok: true, data: { id: PATIENT } })
    expect(afterSuccess).toHaveBeenCalledWith(
      { id: PATIENT },
      { name: 'Maria' },
      expect.objectContaining({ clinicId: CLINIC, userId: USER }),
    )
  })

  it('nÃ£o executa o efeito quando a mutaÃ§Ã£o devolve erro', async () => {
    const afterSuccess = vi.fn(async () => {})
    const action = patientAction({
      afterSuccess,
      handler: async () => {
        const { err } = await import('../domain/Result')
        return err('conflict', 'nao deu')
      },
    })

    await action({ name: 'Maria' })

    expect(afterSuccess).not.toHaveBeenCalled()
  })
})

describe('tags de invalidacao', () => {
  it('invalida a tag da clinica ativa depois do sucesso', async () => {
    const action = patientAction({
      cacheTags: ({ clinicId }, output) => [
        cacheTags.patients(clinicId),
        cacheTags.patient(clinicId, output.id),
      ],
    })

    const result = await action({ name: 'Maria' })

    expect(result.ok).toBe(true)
    expect(updateTag.mock.calls.map(([tag]) => tag)).toEqual([
      `clinic:${CLINIC}:patients`,
      `clinic:${CLINIC}:patient:${PATIENT}`,
    ])
  })

  it('a clinica vem da sessao, nao da entrada', async () => {
    // O cliente manda `clinicId` da clinica vizinha no corpo. O schema o aceita
    // (e um campo livre); o pipeline nao o oferece a `cacheTags`.
    const action = createAction<{ name: string; clinicId: string }, { id: string }>({
      name: 'patient.test',
      schema: z.object({ name: z.string(), clinicId: z.string() }),
      handler: async () => ok({ id: PATIENT }),
      cacheTags: ({ clinicId }) => [cacheTags.patients(clinicId)],
    })

    await action({ name: 'Maria', clinicId: OTHER_CLINIC })

    expect(updateTag).toHaveBeenCalledExactlyOnceWith(`clinic:${CLINIC}:patients`)
    expect(updateTag).not.toHaveBeenCalledWith(`clinic:${OTHER_CLINIC}:patients`)
  })

  it('o callback recebe apenas clinica, usuario e saida — nunca a entrada', async () => {
    const seen = vi.fn()
    const action = patientAction({
      cacheTags: (...args) => {
        seen(...args)
        return []
      },
    })

    await action({ name: 'Maria' })

    expect(seen).toHaveBeenCalledWith({ clinicId: CLINIC, userId: USER }, { id: PATIENT })
    // A garantia estrutural: nenhum argumento do callback contem o formulario.
    expect(JSON.stringify(seen.mock.calls[0])).not.toContain('Maria')
  })

  it('trocar a clinica ativa troca a tag — nada e compartilhado entre tenants', async () => {
    const action = patientAction({
      cacheTags: ({ clinicId }) => [cacheTags.patients(clinicId)],
    })

    await action({ name: 'Maria' })
    sessionState.mockResolvedValue(activeSession(OTHER_CLINIC))
    await action({ name: 'Maria' })

    expect(updateTag.mock.calls.map(([tag]) => tag)).toEqual([
      `clinic:${CLINIC}:patients`,
      `clinic:${OTHER_CLINIC}:patients`,
    ])
  })

  it('nao invalida nada quando o caso de uso falha', async () => {
    const { err } = await import('../domain/Result')
    const action = patientAction({
      handler: async () => err('conflict', 'nao deu'),
      cacheTags: ({ clinicId }) => [cacheTags.patients(clinicId)],
    })

    const result = await action({ name: 'Maria' })

    expect(result.ok).toBe(false)
    expect(updateTag).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('nao invalida nada quando a entrada nao passa no schema', async () => {
    const action = patientAction({
      cacheTags: ({ clinicId }) => [cacheTags.patients(clinicId)],
    })

    const result = await action({ name: 42 })

    expect(result.ok).toBe(false)
    expect(updateTag).not.toHaveBeenCalled()
  })

  it('nao invalida nada quando nao ha clinica ativa', async () => {
    sessionState.mockResolvedValue({
      status: 'needs-onboarding',
      user: { id: USER, email: null, displayName: 'Teste', avatarUrl: null },
    })

    const action = patientAction({
      cacheTags: ({ clinicId }) => [cacheTags.patients(clinicId)],
    })

    const result = await action({ name: 'Maria' })

    expect(result).toMatchObject({ ok: false, error: { code: 'no-active-clinic' } })
    expect(updateTag).not.toHaveBeenCalled()
  })
})

describe('compatibilidade com revalidatePaths', () => {
  it('quem so declara caminhos continua funcionando como antes de F-02', async () => {
    const action = patientAction({ revalidatePaths: ['/pacientes'] })

    await action({ name: 'Maria' })

    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith('/pacientes')
    expect(updateTag).not.toHaveBeenCalled()
  })

  it('caminho e tag convivem na mesma action', async () => {
    const action = patientAction({
      cacheTags: ({ clinicId }) => [cacheTags.patients(clinicId)],
      revalidatePaths: ['/pacientes'],
    })

    await action({ name: 'Maria' })

    expect(updateTag).toHaveBeenCalledExactlyOnceWith(`clinic:${CLINIC}:patients`)
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith('/pacientes')
  })
})

describe('a invalidacao nao derruba a escrita', () => {
  it('tag invalida vira log de servidor, e o sucesso continua sendo devolvido', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Fabricar tag com clinica vazia lanca — o que nao pode acontecer e a
    // mutacao ja concluida virar erro na tela por causa disso.
    const action = patientAction({
      cacheTags: () => [cacheTags.patients('')],
      revalidatePaths: ['/pacientes'],
    })

    const result = await action({ name: 'Maria' })

    expect(result).toEqual({ ok: true, data: { id: PATIENT } })
    expect(consoleError).toHaveBeenCalled()
    // A excecao interrompe o passo 6 inteiro: o caminho tambem nao revalida.
    expect(revalidatePath).not.toHaveBeenCalled()

    consoleError.mockRestore()
  })
})

/**
 * O estado COMERCIAL da clínica — feature **C-ST**.
 *
 * `clinics.status` existia com cinco valores e ninguém o lia: uma clínica
 * `suspended` no banco funcionava inteira. O portão mora aqui, e não em cada
 * action, porque a regra é uma só para as 118 — espalhá-la garantiria que a
 * próxima action nascesse sem ela.
 */
describe('estado da clínica', () => {
  it.each(['trial', 'active'] as const)('%s grava normalmente', async (status) => {
    sessionState.mockResolvedValue(activeSession(CLINIC, status))

    const result = await patientAction()({ name: 'Maria' })

    expect(result.ok).toBe(true)
  })

  it('`past_due` CONTINUA gravando', async () => {
    /*
     * Boleto atrasado não pode impedir a recepção de registrar quem acabou de
     * chegar. Cortar aqui transformaria pendência financeira em risco
     * assistencial.
     */
    sessionState.mockResolvedValue(activeSession(CLINIC, 'past_due'))

    const result = await patientAction()({ name: 'Maria' })

    expect(result.ok).toBe(true)
  })

  it.each(['suspended', 'canceled'] as const)('%s bloqueia a escrita', async (status) => {
    sessionState.mockResolvedValue(activeSession(CLINIC, status))

    const result = await patientAction()({ name: 'Maria' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('forbidden')
      expect(result.error.message).toMatch(/assinaturas/i)
    }
  })

  it('o bloqueio vem DEPOIS do papel', async () => {
    /*
     * Quem nem podia executar a ação recebe 'forbidden' por falta de permissão,
     * e não um aviso sobre a assinatura da clínica — que não é problema dele e
     * revelaria o estado comercial para quem não tem acesso.
     */
    sessionState.mockResolvedValue({
      ...activeSession(CLINIC, 'suspended'),
      role: 'receptionist' as const,
    })

    const restricted = patientAction({ roles: ['owner'] })
    const result = await restricted({ name: 'Maria' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).not.toMatch(/assinaturas/i)
  })

  it('estado desconhecido NÃO bloqueia', async () => {
    /*
     * `null` é leitura que falhou. Um Postgres indisponível não pode virar
     * clínica trancada — mesma escolha da cota do plano e do expediente.
     */
    sessionState.mockResolvedValue({ ...activeSession(), clinicStatus: null })

    const result = await patientAction()({ name: 'Maria' })

    expect(result.ok).toBe(true)
  })
})

/**
 * O segundo fator no PIPELINE, e não só na casca.
 *
 * `app/(app)/layout.tsx` desvia para `/verificacao` quem tem fator cadastrado e
 * não o apresentou — mas layout só roda em navegação. Server Action é endpoint
 * POST próprio, endereçável pelo id que vai no bundle do cliente: quem tivesse a
 * senha entrava em `aal1`, era barrado na tela e continuava alcançando as 118
 * actions por chamada direta. O segundo fator ficava anulado contra exatamente a
 * ameaça que ele existe para deter.
 */
describe('segundo fator', () => {
  it('sessão `aal1` com fator cadastrado não executa a action', async () => {
    assuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    })

    const handler = vi.fn(async () => ok({ id: PATIENT }))
    const result = await patientAction({ handler })({ name: 'Maria' })

    expect(result.ok).toBe(false)
    expect(handler).not.toHaveBeenCalled()
  })

  it('a mensagem diz o que fazer, e não "peça permissão"', async () => {
    /*
     * O código do erro é o genérico, mas o texto não pode ser: quem lê "você não
     * tem permissão" vai procurar um administrador, quando o que falta é o código
     * que a própria pessoa tem no aparelho.
     */
    assuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    })

    const result = await patientAction()({ name: 'Maria' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('forbidden')
      expect(result.error.message).toMatch(/segundo fator/i)
    }
  })

  it('sessão que já apresentou o fator segue normalmente', async () => {
    assuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal2', nextLevel: 'aal2' },
      error: null,
    })

    const result = await patientAction()({ name: 'Maria' })

    expect(result.ok).toBe(true)
  })

  it('conta sem fator cadastrado não é incomodada', async () => {
    // `aal1`/`aal1`: não há segundo fator a apresentar. Exigir aqui trancaria
    // todo mundo que ainda não cadastrou.
    const result = await patientAction()({ name: 'Maria' })

    expect(result.ok).toBe(true)
  })

  it('nível indisponível NÃO tranca a clínica', async () => {
    /*
     * Provedor sem MFA habilitado, ou leitura que falhou. Exigir um código sem
     * conseguir dizer qual fator deixaria a operação inteira parada por causa de
     * uma consulta indisponível — mesma escolha do estado comercial.
     */
    assuranceLevel.mockResolvedValue({
      data: { currentLevel: null, nextLevel: null },
      error: null,
    })

    const result = await patientAction()({ name: 'Maria' })

    expect(result.ok).toBe(true)
  })

  it('leitura que REJEITA não derruba a action', async () => {
    /*
     * A checagem roda fora do `try` que protege o handler: sem tratamento, uma
     * indisponibilidade momentânea do Supabase Auth viraria exceção não tratada
     * nas 118 actions de uma vez, em vez de degradar para "não sei".
     */
    assuranceLevel.mockRejectedValue(new Error('mfa indisponível'))

    const result = await patientAction()({ name: 'Maria' })

    expect(result.ok).toBe(true)
  })

  it('vem ANTES do papel — sessão incompleta não recebe resposta sobre permissão', async () => {
    assuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    })
    sessionState.mockResolvedValue({
      ...activeSession(),
      role: 'receptionist' as const,
    })

    const restricted = patientAction({ roles: ['owner'] })
    const result = await restricted({ name: 'Maria' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toMatch(/segundo fator/i)
  })
})
