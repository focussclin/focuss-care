import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O controle de taxa no caminho do login — feature **S-RL**.
 *
 * A curva do backoff é provada em `lib/security/rate-limit.test.ts`. O que se
 * verifica aqui é a integração, e ela tem três afirmações que nenhum teste de
 * política alcança:
 *
 *  1. A recusa acontece **antes** de falar com o Supabase.
 *  2. Falha registra; acerto **limpa**.
 *  3. A mensagem não revela se o e-mail existe.
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

const signInWithPassword = vi.fn()
/*
 * O login consulta o AAL depois da senha. Aqui a conta nunca tem segundo fator:
 * este arquivo prova a contabilidade das TENTATIVAS, e o desvio do fator tem
 * arquivo proprio.
 */
const getAuthenticatorAssuranceLevel = vi.fn(async () => ({
  data: { currentLevel: 'aal1', nextLevel: 'aal1' },
  error: null,
}))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { signInWithPassword, mfa: { getAuthenticatorAssuranceLevel } },
  }),
}))

const checkLoginThrottle = vi.fn()
/*
 * O parametro precisa ser DECLARADO no `vi.fn`: sem ele o mock e tipado como
 * funcao de zero argumentos e `toHaveBeenCalledWith(email)` nao compila.
 */
const registerLoginFailure = vi.fn(async (email: string) => {
  void email
})
const clearLoginThrottle = vi.fn(async (email: string) => {
  void email
})
vi.mock('@/lib/security/login-throttle', () => ({
  checkLoginThrottle: (email: string) => checkLoginThrottle(email),
  registerLoginFailure: (email: string) => registerLoginFailure(email),
  clearLoginThrottle: (email: string) => clearLoginThrottle(email),
}))

const { signInAction } = await import('./signIn.action')
const { loginMessages } = await import('../schemas/login.schema')

const CREDENTIALS = {
  email: 'maria@exemplo.com',
  password: 'clinica2026',
  rememberMe: false,
}

/** A action desvia no sucesso; aqui só interessa o que ela DEVOLVE. */
async function run(credentials = CREDENTIALS) {
  try {
    return await signInAction(credentials)
  } catch (cause) {
    if (cause instanceof RedirectError) return { ok: true as const, redirected: true }
    throw cause
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  checkLoginThrottle.mockResolvedValue({ allowed: true, retryAfterMs: 0 })
  signInWithPassword.mockResolvedValue({ error: null })
})

describe('quando o limite barra', () => {
  it('não chega ao Supabase', async () => {
    /*
     * A verificação vem antes de propósito: depois seria tarde, porque a
     * tentativa já teria custado uma ida ao provedor de autenticação — que é
     * justamente o recurso que a força bruta consome.
     */
    checkLoginThrottle.mockResolvedValue({ allowed: false, retryAfterMs: 4_000 })

    const result = await run()

    expect(result.ok).toBe(false)
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('diz quantos segundos esperar, arredondando para cima', async () => {
    checkLoginThrottle.mockResolvedValue({ allowed: false, retryAfterMs: 3_200 })

    const result = await run()

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe(loginMessages.tooManyAttempts(4))
  })

  it('a recusa NÃO revela se a conta existe', async () => {
    /*
     * Uma frase diferente para conta real e inventada transformaria o controle
     * de taxa num enumerador de contas — o oposto do que ele existe para fazer.
     */
    checkLoginThrottle.mockResolvedValue({ allowed: false, retryAfterMs: 1_000 })

    const result = await run()

    if (!result.ok) {
      expect(result.error).not.toMatch(/não existe|inexistente|cadastr/i)
      expect(result.error).toMatch(/aguarde/i)
    }
  })

  it('a barreira não depende do resultado da senha', async () => {
    // Mesmo com a senha certa, o limite vale: senão bastaria acertar uma vez
    // para reabrir a janela.
    checkLoginThrottle.mockResolvedValue({ allowed: false, retryAfterMs: 1_000 })
    signInWithPassword.mockResolvedValue({ error: null })

    const result = await run()

    expect(result.ok).toBe(false)
  })
})

describe('contabilidade das tentativas', () => {
  it('credencial errada registra falha', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'invalid' } })

    await run()

    expect(registerLoginFailure).toHaveBeenCalledWith(CREDENTIALS.email)
    expect(clearLoginThrottle).not.toHaveBeenCalled()
  })

  it('login bem-sucedido LIMPA o contador', async () => {
    /*
     * Sem isto, quem errou quatro vezes e acertou na quinta carregaria o backoff
     * para a próxima sessão — punindo quem já provou ser dono da conta.
     */
    await run()

    expect(clearLoginThrottle).toHaveBeenCalledWith(CREDENTIALS.email)
    expect(registerLoginFailure).not.toHaveBeenCalled()
  })

  it('entrada inválida não conta como tentativa', async () => {
    /*
     * Formulário mal preenchido não é ataque, e nem chega ao provedor. Contá-lo
     * deixaria alguém se trancar sozinho errando o formato do e-mail.
     */
    const result = await run({ ...CREDENTIALS, email: 'nao-e-email' })

    expect(result.ok).toBe(false)
    expect(registerLoginFailure).not.toHaveBeenCalled()
    expect(checkLoginThrottle).not.toHaveBeenCalled()
  })
})
