import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Aceite de convite (I-04).
 *
 * O que este arquivo protege é a propriedade que faz um convite ser um convite:
 * **a aplicação não sabe validar token nenhum**. Ela passa o token cru para
 * `accept_invitation()` e acredita no veredito do banco. Se algum dia alguém
 * acrescentar aqui uma comparação de hash, um destes testes quebra.
 *
 * Sem banco, sem rede, sem Next em runtime.
 */

const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const TOKEN = 'inv_5f3a9c1e7b2d4a6081c3e5f7a9b1d3c5'

const revalidatePath = vi.fn<(path: string, type?: string) => void>()

vi.mock('next/cache', () => ({
  revalidatePath: (path: string, type?: string) => revalidatePath(path, type),
}))

vi.mock('next/server', () => ({
  after: (callback: () => unknown) => {
    void callback()
  },
}))

vi.mock('@/lib/audit/audit-log', () => ({
  recordAuditEvent: vi.fn(async () => ({ status: 'skipped' })),
}))

const createSupabaseServerClient = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}))

interface FakeOptions {
  clinicId?: string | null
  rpcError?: { code?: string; message?: string } | null
  refreshError?: { message?: string } | null
  anonymous?: boolean
}

function fakeClient(options: FakeOptions = {}) {
  const rpcCalls: Array<[string, unknown]> = []
  const refresh = vi.fn(async () => ({ error: options.refreshError ?? null }))

  return {
    rpcCalls,
    refresh,
    client: {
      auth: {
        getUser: async () =>
          options.anonymous
            ? { data: { user: null }, error: null }
            : { data: { user: { id: USER } }, error: null },
        refreshSession: refresh,
      },
      rpc: vi.fn(async (name: string, args: unknown) => {
        rpcCalls.push([name, args])
        // `'clinicId' in options` e nao `?? CLINIC`: o caso que interessa e
        // justamente a RPC devolver null, e `null ?? CLINIC` o apagaria.
        return {
          data: options.rpcError
            ? null
            : 'clinicId' in options
              ? options.clinicId
              : CLINIC,
          error: options.rpcError ?? null,
        }
      }),
    },
  }
}

async function accept(token: string) {
  const { acceptInvitationAction } = await import('./acceptInvitation.action')
  return acceptInvitationAction(token)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('acceptInvitationAction', () => {
  it('entrega o token CRU ao banco, sem interpretar nada', async () => {
    // `invitations` guarda `token_hash`. Se a aplicacao soubesse o algoritmo,
    // ela poderia forjar hashes validos e o convite deixaria de ser prova de
    // que alguem foi convidado.
    const fake = fakeClient()
    createSupabaseServerClient.mockResolvedValue(fake.client)

    const result = await accept(TOKEN)

    expect(result.ok).toBe(true)
    expect(fake.rpcCalls).toEqual([['accept_invitation', { p_token: TOKEN }]])
  })

  it('recusa token curto demais antes de tocar no banco', async () => {
    const fake = fakeClient()
    createSupabaseServerClient.mockResolvedValue(fake.client)

    const result = await accept('abc')

    expect(result.ok).toBe(false)
    expect(fake.client.rpc).not.toHaveBeenCalled()
  })

  it('exige sessão — convite não cria conta', async () => {
    const fake = fakeClient({ anonymous: true })
    createSupabaseServerClient.mockResolvedValue(fake.client)

    const result = await accept(TOKEN)

    expect(result.ok).toBe(false)
    expect(fake.client.rpc).not.toHaveBeenCalled()
  })

  it('não revela em que estado o token está', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const inexistente = fakeClient({
      rpcError: { code: 'P0002', message: 'invitation not found' },
    })
    createSupabaseServerClient.mockResolvedValue(inexistente.client)
    const a = await accept(TOKEN)

    const expirado = fakeClient({
      rpcError: { code: 'P0001', message: 'invitation expired at 2026-01-01' },
    })
    createSupabaseServerClient.mockResolvedValue(expirado.client)
    const b = await accept(TOKEN)

    // Separar "nao existe" de "expirou" deixaria descobrir, por tentativa e
    // erro, quais tokens esta clinica ja emitiu.
    expect(a.error).toBe(b.error)
    expect(a.error).not.toMatch(/expired|not found|2026-01-01/)

    spy.mockRestore()
  })

  it('renova a sessão para a clínica nova aparecer no seletor', async () => {
    const fake = fakeClient()
    createSupabaseServerClient.mockResolvedValue(fake.client)

    await accept(TOKEN)

    // Sem o refresh, `listUserClinics` nao veria o vinculo recem-criado ate o
    // proximo refresh natural do token — e o usuario concluiria que o convite
    // nao funcionou.
    expect(fake.refresh).toHaveBeenCalledTimes(1)
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('falha de refresh não desfaz o aceite — o vínculo já existe', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = fakeClient({ refreshError: { message: 'refresh failed' } })
    createSupabaseServerClient.mockResolvedValue(fake.client)

    const result = await accept(TOKEN)

    expect(result.ok).toBe(true)
    expect(result.clinicId).toBe(CLINIC)
    // Mas avisa: a sessao precisa ser renovada para a clinica aparecer.
    expect(result.error).toBeTruthy()

    spy.mockRestore()
  })

  it('RPC sem clínica de volta não conta como aceite', async () => {
    const fake = fakeClient({ clinicId: null })
    createSupabaseServerClient.mockResolvedValue(fake.client)

    const result = await accept(TOKEN)

    expect(result.ok).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
