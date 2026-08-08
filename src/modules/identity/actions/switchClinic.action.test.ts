import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Fronteira de tenancy da troca de clínica (I-03).
 *
 * Esta action é a única do produto que recebe um `clinic_id` do cliente. O que
 * este arquivo verifica é o que torna isso aceitável: **um id de clínica alheia
 * não chega à RPC**, e a resposta não deixa descobrir se aquela clínica existe.
 *
 * Não há banco, nem rede, nem Next em runtime — o cliente Supabase e as funções
 * de cache são mocks. Tenancy real continua sendo pgTAP (R1 do roadmap):
 * nenhum teste em Node prova RLS.
 */

const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const MINE = '7e3b0000-0000-4000-8000-00000000b48e'
const NOT_MINE = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'

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
  /** Vínculo que a consulta de `memberships` encontra, ou null. */
  membership?: { id: string } | null
  switchError?: { code?: string; message?: string } | null
  refreshError?: { message?: string } | null
}

function fakeClient(options: FakeOptions = {}) {
  const filters: Array<[string, unknown]> = []
  const rpcCalls: Array<[string, unknown]> = []
  const refresh = vi.fn(async () => ({ error: options.refreshError ?? null }))

  const query = {
    select: () => query,
    eq(column: string, value: unknown) {
      filters.push([column, value])
      return query
    },
    limit: () => query,
    maybeSingle: async () => ({
      data: options.membership ?? null,
      error: null,
    }),
  }

  return {
    filters,
    rpcCalls,
    refresh,
    client: {
      auth: {
        getUser: async () => ({ data: { user: { id: USER } }, error: null }),
        refreshSession: refresh,
      },
      from: vi.fn(() => query),
      rpc: vi.fn(async (name: string, args: unknown) => {
        rpcCalls.push([name, args])
        return { data: null, error: options.switchError ?? null }
      }),
    },
  }
}

async function switchClinic(clinicId: string) {
  const { switchClinicAction } = await import('./switchClinic.action')
  return switchClinicAction(clinicId)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('switchClinicAction', () => {
  it('recusa id que não é uuid antes de falar com o banco', async () => {
    const fake = fakeClient()
    createSupabaseServerClient.mockResolvedValue(fake.client)

    const result = await switchClinic('../admin')

    expect(result.ok).toBe(false)
    expect(fake.client.from).not.toHaveBeenCalled()
    expect(fake.client.rpc).not.toHaveBeenCalled()
  })

  it('exige vínculo ATIVO deste usuário com esta clínica', async () => {
    const fake = fakeClient({ membership: { id: 'm-1' } })
    createSupabaseServerClient.mockResolvedValue(fake.client)

    await switchClinic(MINE)

    expect(fake.filters).toContainEqual(['user_id', USER])
    expect(fake.filters).toContainEqual(['clinic_id', MINE])
    expect(fake.filters).toContainEqual(['status', 'active'])
  })

  it('clínica alheia não chega à RPC', async () => {
    // A consulta de vinculo nao acha linha — e onde a tentativa para.
    const fake = fakeClient({ membership: null })
    createSupabaseServerClient.mockResolvedValue(fake.client)

    const result = await switchClinic(NOT_MINE)

    expect(result.ok).toBe(false)
    expect(fake.rpcCalls).toHaveLength(0)
    expect(fake.refresh).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('não revela se a clínica existe', async () => {
    const fake = fakeClient({ membership: null })
    createSupabaseServerClient.mockResolvedValue(fake.client)

    const semVinculo = await switchClinic(NOT_MINE)
    const inexistente = await switchClinic('11111111-1111-4111-8111-111111111111')

    // Distinguir "nao existe" de "existe, mas nao e sua" entregaria um oraculo
    // de existencia de clinica por tentativa e erro.
    expect(semVinculo.error).toBe(inexistente.error)
  })

  it('troca, renova a sessão e revalida a casca inteira', async () => {
    const fake = fakeClient({ membership: { id: 'm-1' } })
    createSupabaseServerClient.mockResolvedValue(fake.client)

    const result = await switchClinic(MINE)

    expect(result.ok).toBe(true)
    expect(fake.rpcCalls).toEqual([['switch_clinic', { p_clinic_id: MINE }]])

    // Sem o refresh o JWT continuaria apontando para a clinica anterior, e a
    // troca pareceria nao ter funcionado.
    expect(fake.refresh).toHaveBeenCalledTimes(1)

    // Nenhuma tela sobrevive a troca de tenant: revalida o layout, nao um path.
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('recusa da policy vira sessão expirada, sem detalhe de banco', async () => {
    const fake = fakeClient({
      membership: { id: 'm-1' },
      switchError: { code: '42501', message: 'permission denied for function' },
    })
    createSupabaseServerClient.mockResolvedValue(fake.client)

    const result = await switchClinic(MINE)

    expect(result.ok).toBe(false)
    expect(result.error).not.toMatch(/permission denied/)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('falha ao renovar a sessão não deixa a troca passar como sucesso', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = fakeClient({
      membership: { id: 'm-1' },
      refreshError: { message: 'refresh failed' },
    })
    createSupabaseServerClient.mockResolvedValue(fake.client)

    const result = await switchClinic(MINE)

    expect(result.ok).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
