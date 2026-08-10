import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A entrada por e-mail e senha, com destino.
 *
 * Este arquivo existe por causa de uma lacuna que nenhum teste pegava porque
 * nenhum código a exercia: cinco lugares do produto escreviam `?next=` ao mandar
 * alguém para o login, e **ninguém lia**. Todo login terminava em `/dashboard`,
 * inclusive o de quem tinha clicado num link de convite.
 *
 * O que se verifica aqui é o outro lado da moeda — que ler o parâmetro não
 * transformou o login num redirecionador aberto.
 */

class RedirectError extends Error {
  constructor(readonly destination: string) {
    super(`NEXT_REDIRECT:${destination}`)
  }
}

vi.mock('next/navigation', () => ({
  redirect: (destination: string) => {
    // O `redirect()` do Next interrompe o fluxo lançando. Reproduzir isso é o
    // que torna visível o "não há código depois do desvio".
    throw new RedirectError(destination)
  },
}))

const signInWithPassword = vi.fn()
const createSupabaseServerClient = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}))

const { signInAction } = await import('./signIn.action')
const { loginMessages } = await import('../schemas/login.schema')

const CREDENTIALS = {
  email: 'maria@exemplo.com',
  password: 'clinica2026',
  rememberMe: false,
}

/** Para onde a action desviou, ou null se ela devolveu em vez de desviar. */
async function destinationOf(next?: string): Promise<string | null> {
  try {
    await signInAction(CREDENTIALS, next)
    return null
  } catch (cause) {
    if (cause instanceof RedirectError) return cause.destination
    throw cause
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  signInWithPassword.mockResolvedValue({ data: {}, error: null })
  createSupabaseServerClient.mockResolvedValue({
    auth: {
      signInWithPassword: (input: unknown) => signInWithPassword(input),
    },
  })
})

// ---------------------------------------------------------------------------

describe('destino depois de entrar', () => {
  it('sem pedido, vai para o dashboard', async () => {
    expect(await destinationOf()).toBe('/dashboard')
  })

  it.each([
    ['convite', '/convite/tok_9019956fbdd84d61'],
    ['paciente', '/pacientes/9019956f-bdd8-4d61-868d-09b02332dad0'],
    ['agenda', '/agenda'],
    ['lista com filtro', '/pacientes?q=maria&status=active'],
  ])('leva de volta para %s', async (_label, next) => {
    expect(await destinationOf(next)).toBe(next)
  })

  it('o convite sobrevive ao desvio — o caso que estava quebrado', async () => {
    /*
     * `/convite/[token]` manda quem não tem sessão para
     * `/login?next=/convite/<token>`, e o comentário lá dizia que "assim o token
     * sobrevive ao desvio". Não sobrevivia: a pessoa entrava e caía no painel,
     * precisando achar o e-mail de novo — e o link de convite vale uma vez.
     */
    expect(await destinationOf('/convite/tok_abc123')).toBe(
      '/convite/tok_abc123',
    )
  })
})

describe('o login não vira redirecionador aberto', () => {
  it.each([
    ['host absoluto', 'https://evil.net'],
    ['sem esquema', '//evil.net'],
    ['barra invertida', '/\\evil.net'],
    ['javascript:', 'javascript:alert(1)'],
    ['com credenciais', 'https://user:senha@evil.net/'],
  ])('recusa %s e cai no dashboard', async (_label, hostile) => {
    const destination = await destinationOf(hostile)

    expect(destination).toBe('/dashboard')
    expect(destination).not.toContain('evil.net')
  })

  it('o destino devolvido nunca sai do domínio', async () => {
    for (const vector of ['//evil.net', 'https://evil.net/x', '/\\evil.net']) {
      const destination = await destinationOf(vector)
      const resolved = new URL(destination ?? '', 'https://clinica.exemplo')
      expect(resolved.origin).toBe('https://clinica.exemplo')
    }
  })
})

describe('quando não entra', () => {
  it('credencial recusada não desvia para lugar nenhum', async () => {
    signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials', status: 400 },
    })

    const result = await signInAction(CREDENTIALS, '/convite/tok_abc123')

    expect(result.ok).toBe(false)
    expect(result.error).toBe(loginMessages.invalidCredentials)
  })

  it('a mensagem não diz se o e-mail existe', async () => {
    signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'User not found', status: 400 },
    })

    const result = await signInAction(CREDENTIALS)

    expect(result.error).toBe(loginMessages.invalidCredentials)
    expect(result.error).not.toMatch(/not found/i)
  })

  it('entrada inválida nem chega ao provedor', async () => {
    const result = await signInAction(
      { email: 'maria', password: '', rememberMe: false },
      '/agenda',
    )

    expect(result.ok).toBe(false)
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('sem Supabase no ambiente, não promete entrada', async () => {
    createSupabaseServerClient.mockResolvedValue(null)

    const result = await signInAction(CREDENTIALS)

    expect(result.ok).toBe(false)
    expect(result.error).toBe(loginMessages.unexpected)
  })
})
