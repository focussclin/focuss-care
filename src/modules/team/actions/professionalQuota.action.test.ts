import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O limite do plano barrando a escrita — feature **Q-01**.
 *
 * **Não há banco, nem rede, nem Next em runtime.**
 *
 * `plans.max_professionals` era exibido em `/assinaturas` com barra de uso e
 * **nenhuma escrita o consultava**. Estes casos são o que impede a regressão
 * silenciosa: se a guarda sumir, o teste falha; se ela ficar rígida demais,
 * também.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
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

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ __fake: true }),
}))

vi.mock('@/lib/audit/audit-log', () => ({
  recordAuditEvent: async () => ({ recorded: false, reason: 'test' }),
}))

const hasQuotaFor = vi.fn()
vi.mock('@/lib/subscription/plan-quota', () => ({
  hasQuotaFor: (...args: unknown[]) => hasQuotaFor(...args),
}))

const userBelongsToClinic = vi.fn()
const create = vi.fn()
const setActive = vi.fn()
vi.mock('../infrastructure/professional-repository', () => ({
  professionalRepositoryFor: () => ({ userBelongsToClinic, create, setActive }),
}))

const { createProfessionalAction, setProfessionalActiveAction } = await import(
  './professional.action'
)

function professional(isActive = true) {
  return {
    id: PROFESSIONAL,
    userId: null,
    displayName: 'Dra. Helena Alves',
    councilType: 'CRM',
    councilNumber: '12345',
    councilState: 'SP',
    specialties: [],
    agendaColor: null,
    defaultSlotMinutes: 30,
    isActive,
  }
}

const input = {
  displayName: 'Dra. Helena Alves',
  councilType: 'CRM',
  councilNumber: '12345',
  councilState: 'SP',
  specialties: '',
  defaultSlotMinutes: '30',
  userId: '',
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.mockResolvedValue({
    status: 'active' as const,
    user: { id: USER, email: null, displayName: 'Teste', avatarUrl: null },
    clinicId: CLINIC,
    clinicName: null,
    role: 'admin',
  })
  userBelongsToClinic.mockResolvedValue(true)
  create.mockResolvedValue(professional())
  setActive.mockResolvedValue(professional())
  hasQuotaFor.mockResolvedValue({ allowed: true, max: 10 })
})

describe('cadastro', () => {
  it('dentro da cota, cadastra', async () => {
    const result = await createProfessionalAction(input)

    expect(result.ok).toBe(true)
    expect(create).toHaveBeenCalled()
  })

  it('a cota é consultada para a clínica da sessão', async () => {
    await createProfessionalAction(input)

    expect(hasQuotaFor).toHaveBeenCalledWith(
      expect.anything(),
      CLINIC,
      'professionals',
    )
  })

  it('no limite, recusa ANTES de escrever', async () => {
    /*
     * Antes do repositório de propósito: recusar depois do insert exigiria
     * apagar a linha, e apagar profissional é o que este produto não faz —
     * `medical_records.author_id` aponta para lá.
     */
    hasQuotaFor.mockResolvedValue({ allowed: false, max: 10 })

    const result = await createProfessionalAction(input)

    expect(result.ok).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })

  it('a recusa diz o número e o caminho', async () => {
    hasQuotaFor.mockResolvedValue({ allowed: false, max: 10 })

    const result = await createProfessionalAction(input)

    if (!result.ok) {
      expect(result.error.code).toBe('conflict')
      expect(result.error.message).toContain('10 profissionais ativos')
      expect(result.error.message).toMatch(/assinaturas/i)
    }
  })

  it('sem teto, não barra nada', async () => {
    /*
     * Clínica sem assinatura tem `max: null`. Barrá-la trancaria toda clínica
     * criada antes de existir cobrança.
     */
    hasQuotaFor.mockResolvedValue({ allowed: true, max: null })

    const result = await createProfessionalAction(input)

    expect(result.ok).toBe(true)
  })

  it('mesmo com `allowed: false`, teto nulo não barra', async () => {
    // Combinação impossível hoje, e a guarda não depende disso: `max === null`
    // é o que decide, porque é o que a mensagem precisaria citar.
    hasQuotaFor.mockResolvedValue({ allowed: false, max: null })

    const result = await createProfessionalAction(input)

    expect(result.ok).toBe(true)
  })
})

/**
 * A cota conta profissional ATIVO. Sem guarda na reativação, desativar e
 * reativar seria o caminho para furar o limite sem cadastrar ninguém novo — e o
 * furo não apareceria, porque o total cadastrado continuaria igual.
 */
describe('reativação', () => {
  it('reativar consome cota e é barrado no limite', async () => {
    hasQuotaFor.mockResolvedValue({ allowed: false, max: 10 })

    const result = await setProfessionalActiveAction({
      professionalId: PROFESSIONAL,
      isActive: true,
    })

    expect(result.ok).toBe(false)
    expect(setActive).not.toHaveBeenCalled()
  })

  it('DESATIVAR nunca consulta cota — liberar vaga não pode ser barrado', async () => {
    /*
     * O erro que este caso prende: uma guarda sem o `if (input.isActive)`
     * impediria a clínica que estourou o limite de desativar alguém, que é
     * exatamente a operação que a colocaria de volta na regra.
     */
    setActive.mockResolvedValue(professional(false))
    hasQuotaFor.mockResolvedValue({ allowed: false, max: 10 })

    const result = await setProfessionalActiveAction({
      professionalId: PROFESSIONAL,
      isActive: false,
    })

    expect(result.ok).toBe(true)
    expect(hasQuotaFor).not.toHaveBeenCalled()
    expect(setActive).toHaveBeenCalled()
  })
})
