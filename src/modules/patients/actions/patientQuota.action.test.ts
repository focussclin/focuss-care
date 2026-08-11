import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O limite de pacientes barrando o cadastro — feature **Q-01**.
 *
 * **Não há banco, nem rede, nem Next em runtime.**
 *
 * `plans.max_patients` era exibido em `/assinaturas` e nenhuma escrita o
 * consultava. A guarda vem ANTES do repositório: recusar depois do insert
 * exigiria apagar a linha, e o produto não apaga paciente.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'

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

const create = vi.fn()
const findByDocument = vi.fn()
vi.mock('../infrastructure/repository', () => ({
  patientRepositoryFor: () => ({ create, findByDocument }),
}))

const { createPatientAction } = await import('./createPatient.action')

const input = {
  name: 'Maria Souza',
  phone: '(11) 98812-4471',
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.mockResolvedValue({
    status: 'active' as const,
    user: { id: USER, email: null, displayName: 'Teste', avatarUrl: null },
    clinicId: CLINIC,
    clinicName: null,
    role: 'receptionist',
  })
  hasQuotaFor.mockResolvedValue({ allowed: true, max: 500 })
  findByDocument.mockResolvedValue(null)
  create.mockResolvedValue({
    id: '9019956f-bdd8-4d61-868d-09b02332dad0',
    name: 'Maria Souza',
    phone: '(11) 98812-4471',
    email: '',
    birthDate: null,
    status: 'active',
    createdAt: new Date('2026-08-10T12:00:00.000Z'),
    lastVisitAt: null,
    nextVisitAt: null,
  })
})

describe('cadastro de paciente', () => {
  it('dentro da cota, cadastra', async () => {
    const result = await createPatientAction(input)

    expect(result.ok).toBe(true)
    expect(create).toHaveBeenCalled()
  })

  it('a cota é consultada para a clínica da sessão', async () => {
    await createPatientAction(input)

    expect(hasQuotaFor).toHaveBeenCalledWith(expect.anything(), CLINIC, 'patients')
  })

  it('no limite, recusa ANTES de escrever', async () => {
    hasQuotaFor.mockResolvedValue({ allowed: false, max: 500 })

    const result = await createPatientAction(input)

    expect(result.ok).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })

  it('a recusa diz o número e o caminho', async () => {
    /*
     * Quem lê esta frase é a recepção, que não decide plano nenhum. "Limite
     * atingido" sozinho deixaria sem saber se são 10 ou 1000, nem o que fazer.
     */
    hasQuotaFor.mockResolvedValue({ allowed: false, max: 500 })

    const result = await createPatientAction(input)

    if (!result.ok) {
      expect(result.error.code).toBe('conflict')
      expect(result.error.message).toContain('500 pacientes')
      expect(result.error.message).toMatch(/assinaturas/i)
    }
  })

  it('clínica sem assinatura não é barrada', async () => {
    /*
     * `max: null` é sem teto. Tratar a ausência de assinatura como limite zero
     * trancaria toda clínica criada antes de existir cobrança.
     */
    hasQuotaFor.mockResolvedValue({ allowed: true, max: null })

    const result = await createPatientAction(input)

    expect(result.ok).toBe(true)
  })
})
