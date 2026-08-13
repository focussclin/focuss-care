import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O segundo fator, do lado do servidor.
 *
 * O arquivo existe por causa de uma escalada concreta: quem tem a senha entra em
 * `aal1`, e o desvio de `app/(app)/layout.tsx` só cobre NAVEGAÇÃO. Server Action
 * é endpoint POST próprio — `enroll` seguido de `verify` era alcançável por
 * chamada direta, e confirmar um aparelho novo com o código do próprio atacante
 * levaria a sessão a `aal2` sem nunca tocar o fator da vítima.
 *
 * A assimetria testada aqui é o que importa: **cadastrar e remover** exigem ter
 * apresentado o fator; **verificar** não pode exigir, porque verificar é o que a
 * tela `/verificacao` faz — e ali a sessão está legitimamente em `aal1`.
 */

const enroll = vi.fn()
const challengeAndVerify = vi.fn()
const unenroll = vi.fn()
const listFactorsApi = vi.fn()
const getAuthenticatorAssuranceLevel = vi.fn()
const revalidatePath = vi.fn()

vi.mock('next/cache', () => ({
  revalidatePath: (path: string, type?: string) => revalidatePath(path, type),
}))

const supabase = {
  auth: {
    mfa: {
      enroll: (...args: unknown[]) => enroll(...args),
      challengeAndVerify: (...args: unknown[]) => challengeAndVerify(...args),
      unenroll: (...args: unknown[]) => unenroll(...args),
      listFactors: () => listFactorsApi(),
      getAuthenticatorAssuranceLevel: () => getAuthenticatorAssuranceLevel(),
    },
  },
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => supabase,
}))

const {
  enrollTotpAction,
  verifyTotpAction,
  unenrollFactorAction,
  listFactors,
} = await import('./mfa.action')
const { mfaMessages } = await import('../schemas/mfa.schema')

const FACTOR = 'f1a2b3c4-d5e6-4f70-8a9b-0c1d2e3f4a5b'

/** Conta sem nenhum fator verificado: o primeiro cadastro da vida. */
const semFator = { currentLevel: 'aal1', nextLevel: 'aal1' }
/** Fator cadastrado e NÃO apresentado — quem entrou só com a senha. */
const soSenha = { currentLevel: 'aal1', nextLevel: 'aal2' }
/** Fator cadastrado e apresentado. */
const verificada = { currentLevel: 'aal2', nextLevel: 'aal2' }

beforeEach(() => {
  vi.clearAllMocks()
  getAuthenticatorAssuranceLevel.mockResolvedValue({ data: semFator, error: null })
  enroll.mockResolvedValue({
    data: {
      id: FACTOR,
      totp: { qr_code: '<svg />', secret: 'JBSWY3DPEHPK3PXP' },
    },
    error: null,
  })
  challengeAndVerify.mockResolvedValue({ error: null })
  unenroll.mockResolvedValue({ error: null })
  listFactorsApi.mockResolvedValue({ data: { all: [] }, error: null })
})

// ---------------------------------------------------------------------------

describe('cadastrar aparelho', () => {
  it('o primeiro fator da conta é permitido em sessão `aal1`', async () => {
    /*
     * Sem esta passagem o recurso seria inalcançável: quem nunca cadastrou
     * aparelho está sempre em `aal1`, e exigir código dele trancaria todo mundo
     * para fora da própria proteção.
     */
    const result = await enrollTotpAction('Celular da Ana')

    expect(result.ok).toBe(true)
    expect(result.secret).toBe('JBSWY3DPEHPK3PXP')
    expect(result.qrCode).toBe('<svg />')
    expect(result.factorId).toBe(FACTOR)
  })

  it('quem só tem a senha NÃO cadastra um aparelho novo', async () => {
    /*
     * A escalada: com a senha roubada, cadastrar o próprio TOTP e confirmá-lo
     * levaria a sessão a `aal2` sem tocar o fator da vítima.
     */
    getAuthenticatorAssuranceLevel.mockResolvedValue({ data: soSenha, error: null })

    const result = await enrollTotpAction('Celular do atacante')

    expect(result.ok).toBe(false)
    expect(result.error).toBe(mfaMessages.stepUpRequired)
    expect(enroll).not.toHaveBeenCalled()
  })

  it('sessão já verificada cadastra um segundo aparelho', async () => {
    getAuthenticatorAssuranceLevel.mockResolvedValue({ data: verificada, error: null })

    const result = await enrollTotpAction('Tablet')

    expect(result.ok).toBe(true)
  })

  it('nível indisponível não tranca a pessoa fora da própria conta', async () => {
    getAuthenticatorAssuranceLevel.mockRejectedValue(new Error('auth fora do ar'))

    const result = await enrollTotpAction('Celular da Ana')

    expect(result.ok).toBe(true)
  })

  it('nome curto é recusado antes de falar com o provedor', async () => {
    const result = await enrollTotpAction(' A ')

    expect(result.ok).toBe(false)
    expect(result.error).toBe(mfaMessages.nameRequired)
    expect(enroll).not.toHaveBeenCalled()
  })

  it('recusa do provedor não vaza o código do erro', async () => {
    enroll.mockResolvedValue({ data: null, error: { code: 'mfa_disabled' } })

    const result = await enrollTotpAction('Celular da Ana')

    expect(result.ok).toBe(false)
    expect(result.error).toBe(mfaMessages.enrollFailed)
    expect(result.error).not.toMatch(/mfa_disabled/)
  })
})

describe('verificar o código', () => {
  it('NÃO exige fator apresentado — é o que a tela de verificação faz', async () => {
    /*
     * Aqui a sessão está legitimamente em `aal1`: é o estado que esta ação
     * existe para resolver. Aplicar a mesma guarda do cadastro trancaria todo
     * mundo para fora, e é o erro que este teste impede de nascer.
     */
    getAuthenticatorAssuranceLevel.mockResolvedValue({ data: soSenha, error: null })

    const result = await verifyTotpAction(FACTOR, '123456')

    expect(result.ok).toBe(true)
    expect(challengeAndVerify).toHaveBeenCalledWith({
      factorId: FACTOR,
      code: '123456',
    })
  })

  it('código malformado não chega ao provedor', async () => {
    const result = await verifyTotpAction(FACTOR, '12a')

    expect(result.ok).toBe(false)
    expect(result.error).toBe(mfaMessages.codeInvalid)
    expect(challengeAndVerify).not.toHaveBeenCalled()
  })

  it('a casca inteira é revalidada — a sessão subiu de nível', async () => {
    await verifyTotpAction(FACTOR, '123456')

    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('código recusado não revalida nem vaza o motivo', async () => {
    challengeAndVerify.mockResolvedValue({ error: { code: 'invalid_code' } })

    const result = await verifyTotpAction(FACTOR, '123456')

    expect(result.ok).toBe(false)
    expect(result.error).toBe(mfaMessages.codeRejected)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('remover aparelho', () => {
  it('quem só tem a senha NÃO remove o fator da conta', async () => {
    // A jogada mais direta de quem roubou a senha: apagar a barreira.
    getAuthenticatorAssuranceLevel.mockResolvedValue({ data: soSenha, error: null })

    const result = await unenrollFactorAction(FACTOR)

    expect(result.ok).toBe(false)
    expect(result.error).toBe(mfaMessages.stepUpRequired)
    expect(unenroll).not.toHaveBeenCalled()
  })

  it('sessão verificada remove', async () => {
    getAuthenticatorAssuranceLevel.mockResolvedValue({ data: verificada, error: null })

    const result = await unenrollFactorAction(FACTOR)

    expect(result.ok).toBe(true)
    expect(unenroll).toHaveBeenCalledWith({ factorId: FACTOR })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})

describe('listar aparelhos', () => {
  it('separa verificados de pendentes', async () => {
    listFactorsApi.mockResolvedValue({
      data: {
        all: [
          { id: FACTOR, friendly_name: 'Celular da Ana', status: 'verified' },
          { id: 'outro', friendly_name: null, status: 'unverified' },
        ],
      },
      error: null,
    })

    const result = await listFactors()

    expect(result.active).toEqual([
      { id: FACTOR, friendlyName: 'Celular da Ana', status: 'verified' },
    ])
    expect(result.pending).toEqual([
      { id: 'outro', friendlyName: null, status: 'unverified' },
    ])
    expect(result.unavailable).toBe(false)
  })

  it('falha na listagem não vira "sem fator"', async () => {
    /*
     * A distinção importa na tela: "esta conta não tem segundo fator" convida a
     * cadastrar um; "não consegui ler" pede para tentar de novo.
     */
    listFactorsApi.mockResolvedValue({ data: null, error: { code: 'unavailable' } })

    const result = await listFactors()

    expect(result.unavailable).toBe(true)
    expect(result.active).toEqual([])
  })
})
