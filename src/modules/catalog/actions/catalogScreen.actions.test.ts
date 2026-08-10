import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O preço não atravessa a fronteira para quem não pode vê-lo.
 *
 * **Não há banco, nem rede, nem Next em runtime.** O que se verifica é o que o
 * servidor decide sozinho.
 *
 * # O achado
 *
 * As actions de escrita devolviam `toServiceDto(service, true)` — preço sempre
 * incluso — com o argumento de que quem escreve acabou de digitar o valor. O
 * argumento falha em dois pontos:
 *
 *  1. `clinic.settings` e `invoice.read` são permissões distintas. Hoje os dois
 *     papéis que têm a primeira também têm a segunda, mas isso é um acidente da
 *     matriz atual: mudá-la faria o preço vazar sem que nada quebrasse.
 *  2. As actions são EXPORTADAS. Quem as chama direto não passa pela tela, e
 *     `service.update` devolve o registro inteiro — bastaria alterar o nome de
 *     um serviço para receber de volta o preço dele.
 *
 * O papel de teste abaixo (`clinic.settings` sem `invoice.read`) não existe na
 * matriz de hoje, e é exatamente por isso que ele está aqui: o teste prova que a
 * defesa não depende do formato atual da matriz.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const SERVICE = '11111111-1111-4111-8111-111111111111'

vi.mock('next/cache', () => ({
  updateTag: () => {},
  revalidatePath: () => {},
}))

vi.mock('next/server', () => ({
  after: (callback: () => unknown) => {
    void callback()
  },
}))

vi.mock('next/navigation', () => ({ unstable_rethrow: () => {} }))

/**
 * A matriz de permissões é substituída para poder existir um papel que a matriz
 * real não tem: `clinic.settings` SEM `invoice.read`.
 *
 * É a única forma de provar que a defesa não depende do formato atual da
 * matriz. `rolesWith` continua devolvendo quem escreve; `can` responde conforme
 * `PERMISSOES`, ajustável por teste.
 */
let PERMISSOES: string[] = ['clinic.settings', 'invoice.read']

vi.mock('@/lib/auth/permissions', () => ({
  rolesWith: () => ['owner', 'admin'],
  can: (role: string | null, permission: string) =>
    role !== null && PERMISSOES.includes(permission),
}))

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

const list = vi.fn()
const create = vi.fn()
const update = vi.fn()
const setActive = vi.fn()
vi.mock('../infrastructure/repository', () => ({
  serviceRepositoryFor: () => ({ list, create, update, setActive }),
}))

const { createServiceAction, updateServiceAction } = await import('./catalogScreen.actions')

function service(overrides: Record<string, unknown> = {}) {
  return {
    id: SERVICE,
    code: 'CONS01',
    tussCode: '10101012',
    name: 'Consulta clínica',
    description: null,
    category: 'Consultas',
    defaultDurationMinutes: 30,
    defaultPriceCents: 25_000,
    requiresAuthorization: false,
    isActive: true,
    updatedAt: new Date('2026-08-10T10:00:00.000Z'),
    ...overrides,
  }
}

function session(role: string | null) {
  return {
    status: 'active' as const,
    user: { id: USER, email: null, displayName: 'Teste', avatarUrl: null },
    clinicId: CLINIC,
    clinicName: null,
    role,
  }
}

const input = {
  name: 'Consulta clínica',
  code: 'CONS01',
  tussCode: '10101012',
  category: 'Consultas',
  description: '',
  defaultDurationMinutes: '30',
  defaultPriceCents: 25_000,
  requiresAuthorization: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  PERMISSOES = ['clinic.settings', 'invoice.read']
  sessionState.mockResolvedValue(session('owner'))
  list.mockResolvedValue([])
  create.mockResolvedValue(service())
  update.mockResolvedValue(service())
  setActive.mockResolvedValue(service())
})

describe('o preço volta para quem tem `invoice.read`', () => {
  it.each(['owner', 'admin'])('%s recebe o valor', async (role) => {
    sessionState.mockResolvedValue(session(role))

    const result = await createServiceAction(input)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.defaultPriceCents).toBe(25_000)
  })
})

describe('o preço NÃO volta para quem não tem `invoice.read`', () => {
  it('papel com clinic.settings e SEM invoice.read escreve, e não recebe o valor', async () => {
    /*
     * O coração desta correção. Este papel não existe na matriz de hoje, e é
     * por isso que o teste o constrói: a defesa não pode depender de os dois
     * papéis administrativos continuarem sendo também financeiros.
     *
     * A escrita ACONTECE — a permissão de escrita é outra. O que muda é o que
     * volta.
     */
    PERMISSOES = ['clinic.settings']

    const result = await createServiceAction(input)

    expect(result.ok).toBe(true)
    expect(create).toHaveBeenCalled()
    if (result.ok) {
      expect(result.data.defaultPriceCents).toBeNull()
      // O resto do registro continua indo: sem nome e código a tela não lista.
      expect(result.data.name).toBe('Consulta clínica')
      expect(result.data.code).toBe('CONS01')
    }
  })

  it('a edição tem o mesmo cuidado — ela devolve o registro inteiro', async () => {
    /*
     * `service.update` é a porta mais larga: bastaria alterar o nome de um
     * serviço para receber de volta o preço dele.
     */
    PERMISSOES = ['clinic.settings']

    const result = await updateServiceAction({ serviceId: SERVICE, ...input })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.defaultPriceCents).toBeNull()
  })

  it('papel fora da lista de escrita nem chega ao DTO', async () => {
    /*
     * A guarda de escrita do `createAction` compara o papel da sessão com a
     * lista de `roles` — ela não passa por `can`. Por isso o teste troca o
     * PAPEL, e não a matriz: mexer em `PERMISSOES` aqui estaria testando o
     * próprio mock.
     */
    sessionState.mockResolvedValue(session('receptionist'))

    const result = await createServiceAction(input)

    expect(result.ok).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('a trilha de auditoria registra o que foi GRAVADO', () => {
  it('o preço vai para o `audit_log` mesmo quando o DTO o omite', async () => {
    /*
     * A correção não pode degradar a auditoria: `after.price_cents` sai do
     * INPUT, que é o que o repositório persistiu, e não do DTO devolvido.
     * `audit_log` tem a própria permissão de leitura (`audit.read`).
     */
    await createServiceAction(input)

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service.created',
        after: expect.objectContaining({ price_cents: 25_000 }),
      }),
    )
  })

  it('a edição também audita o valor persistido', async () => {
    await updateServiceAction({ serviceId: SERVICE, ...input })

    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'service.updated',
        after: expect.objectContaining({ price_cents: 25_000 }),
      }),
    )
  })
})

describe('escopo de tenant', () => {
  it('a clínica sai do contexto, nunca da entrada', async () => {
    await createServiceAction({ ...input, clinicId: 'outra-clinica' })

    expect(create).toHaveBeenCalledWith(CLINIC, expect.anything())
  })
})
