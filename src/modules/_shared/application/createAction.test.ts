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

// Cliente marcado, nao funcional: o handler dos testes nunca consulta nada.
const supabase = { __fake: true }
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

function activeSession(clinicId = CLINIC) {
  return {
    status: 'active' as const,
    user: { id: USER, email: null, displayName: 'Teste', avatarUrl: null },
    clinicId,
    clinicName: null,
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
