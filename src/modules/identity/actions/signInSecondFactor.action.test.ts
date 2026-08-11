import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O desvio para a segunda etapa — feature **S-MFA**.
 *
 * A regra do AAL está provada em `lib/security/mfa.test.ts`. O que se verifica
 * aqui é a consequência: senha certa **não basta** quando a conta tem fator, e o
 * destino pedido sobrevive ao desvio.
 *
 * Sem isto, cadastrar um segundo fator seria segurança FALSA — a pessoa veria
 * "verificação em duas etapas ativa" e entraria só com a senha.
 */

class RedirectError extends Error {
  constructor(readonly destination: string) {
    super(`NEXT_REDIRECT:${destination}`)
  }
}

vi.mock('next/navigation', () => ({
  redirect: (destination: string) => {
    throw new RedirectError(destination)
  },
}))

vi.mock('@/lib/security/login-throttle', () => ({
  checkLoginThrottle: async () => ({ allowed: true, retryAfterMs: 0 }),
  registerLoginFailure: async () => {},
  clearLoginThrottle: async () => {},
}))

const signInWithPassword = vi.fn()
const getAuthenticatorAssuranceLevel = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { signInWithPassword, mfa: { getAuthenticatorAssuranceLevel } },
  }),
}))

const { signInAction } = await import('./signIn.action')

const CREDENTIALS = {
  email: 'maria@exemplo.com',
  password: 'clinica2026',
  rememberMe: false,
}

/** Para onde a action desviou. */
async function destinationOf(next?: string): Promise<string> {
  try {
    await signInAction(CREDENTIALS, next)
  } catch (cause) {
    if (cause instanceof RedirectError) return cause.destination
    throw cause
  }

  throw new Error('a action nao desviou')
}

function assurance(currentLevel: string | null, nextLevel: string | null) {
  return { data: { currentLevel, nextLevel }, error: null }
}

beforeEach(() => {
  vi.clearAllMocks()
  signInWithPassword.mockResolvedValue({ data: {}, error: null })
  getAuthenticatorAssuranceLevel.mockResolvedValue(assurance('aal1', 'aal1'))
})

describe('conta com segundo fator', () => {
  it('a senha certa leva para a verificação, não para o dashboard', async () => {
    getAuthenticatorAssuranceLevel.mockResolvedValue(assurance('aal1', 'aal2'))

    expect(await destinationOf()).toBe('/verificacao?next=%2Fdashboard')
  })

  it('o destino pedido sobrevive ao desvio', async () => {
    /*
     * Quem clicou num link de convite continua indo para lá depois do código.
     * Perder o destino aqui devolveria o defeito que `safeNextPath` corrigiu.
     */
    getAuthenticatorAssuranceLevel.mockResolvedValue(assurance('aal1', 'aal2'))

    expect(await destinationOf('/agenda')).toBe('/verificacao?next=%2Fagenda')
  })

  it('o destino continua sendo decidido no servidor', async () => {
    /*
     * `safeNextPath` roda ANTES de virar parâmetro: um host absoluto não pode
     * atravessar a verificação e virar redirecionamento aberto do outro lado.
     */
    getAuthenticatorAssuranceLevel.mockResolvedValue(assurance('aal1', 'aal2'))

    expect(await destinationOf('https://exemplo.com/roubo')).toBe(
      '/verificacao?next=%2Fdashboard',
    )
  })
})

describe('conta sem segundo fator', () => {
  it('entra direto', async () => {
    expect(await destinationOf()).toBe('/dashboard')
  })

  it('sessão já verificada não passa pela tela de novo', async () => {
    // Comparar só `nextLevel` mandaria para o código quem acabou de digitá-lo.
    getAuthenticatorAssuranceLevel.mockResolvedValue(assurance('aal2', 'aal2'))

    expect(await destinationOf()).toBe('/dashboard')
  })

  it('AAL indisponível NÃO tranca ninguém', async () => {
    /*
     * Leitura falha, ou provedor sem MFA: exigir código sem conseguir dizer qual
     * fator trancaria a pessoa para fora por causa de uma consulta indisponível.
     */
    getAuthenticatorAssuranceLevel.mockResolvedValue({ data: null, error: null })

    expect(await destinationOf()).toBe('/dashboard')
  })
})

describe('a consulta do fator só acontece depois da senha', () => {
  it('credencial errada não chega a perguntar o AAL', async () => {
    // Perguntar antes vazaria se a conta tem 2FA para quem não sabe a senha.
    signInWithPassword.mockResolvedValue({ error: { message: 'invalid' } })

    const result = await signInAction(CREDENTIALS)

    expect(result.ok).toBe(false)
    expect(getAuthenticatorAssuranceLevel).not.toHaveBeenCalled()
  })
})
