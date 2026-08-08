import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O callback do Supabase Auth, que agora serve a DOIS fluxos.
 *
 * O teste existe por causa de um defeito concreto que a fatia P-RS criaria sem
 * ele: o callback traduzia qualquer `?error=access_denied` para
 * `oauth_cancelled` e mandava a pessoa ao login. Um link de recuperação vencido
 * chega exatamente assim — e quem tinha esquecido a senha leria "o login com
 * Google foi cancelado" numa tela que não resolve o problema dela.
 *
 * O outro grupo é o redirecionamento aberto: `next` vem da URL, e URL é entrada
 * de quem clicou no link.
 */

const exchangeCodeForSession = vi.fn()
const createSupabaseServerClient = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => createSupabaseServerClient(),
}))

const { GET } = await import('./route')

const ORIGIN = 'https://clinica.exemplo.com.br'

/**
 * O que o handler realmente usa de `NextRequest`: `nextUrl` e `url`.
 *
 * Montar um `NextRequest` de verdade exigiria o runtime de servidor do Next; o
 * recorte abaixo é honesto porque qualquer campo a mais que o handler passe a
 * ler quebra o teste em vez de passar despercebido.
 */
function request(query: string) {
  const url = `${ORIGIN}/auth/callback${query}`
  return { nextUrl: new URL(url), url } as never
}

/** Para onde o callback mandou, sem a origem. */
async function destinationOf(query: string): Promise<string> {
  const response = await GET(request(query))
  const location = response.headers.get('location') ?? ''
  const url = new URL(location, ORIGIN)

  return `${url.pathname}${url.search}`
}

beforeEach(() => {
  vi.clearAllMocks()
  exchangeCodeForSession.mockResolvedValue({ error: null })
  createSupabaseServerClient.mockResolvedValue({
    auth: { exchangeCodeForSession: (code: string) => exchangeCodeForSession(code) },
  })
})

// ---------------------------------------------------------------------------

describe('login com Google', () => {
  it('troca o código e leva ao dashboard', async () => {
    expect(await destinationOf('?code=abc123')).toBe('/dashboard')
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc123')
  })

  it('cancelamento volta ao login com o código do aviso', async () => {
    expect(await destinationOf('?error=access_denied')).toBe(
      '/login?error=oauth_cancelled',
    )
  })

  it('sem código é callback inválido', async () => {
    expect(await destinationOf('')).toBe('/login?error=invalid_callback')
  })

  it('troca recusada volta ao login, sem detalhe do provedor', async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: { message: 'invalid grant: code verifier mismatch' },
    })

    const destination = await destinationOf('?code=abc123')

    expect(destination).toBe('/login?error=oauth_error')
    expect(destination).not.toContain('verifier')
  })
})

describe('link de recuperação de senha', () => {
  it('troca o código e leva à tela de nova senha', async () => {
    expect(await destinationOf('?code=abc123&next=%2Fredefinir-senha')).toBe(
      '/redefinir-senha',
    )
  })

  it('link vencido volta para PEDIR OUTRO, e não para o login', async () => {
    /*
     * O defeito que este teste tranca: sem o desvio por fluxo, o
     * `error=access_denied` do link vencido viraria "o login com Google foi
     * cancelado".
     */
    const destination = await destinationOf(
      '?error=access_denied&error_code=otp_expired&next=%2Fredefinir-senha',
    )

    expect(destination).toBe('/recuperar-senha?erro=expirado')
    expect(destination).not.toContain('oauth')
    expect(destination).not.toContain('/login')
  })

  it('reconhece o vencimento pela descrição, quando não vem o código', async () => {
    expect(
      await destinationOf(
        '?error=access_denied&error_description=Email+link+is+invalid+or+has+expired&next=%2Fredefinir-senha',
      ),
    ).toBe('/recuperar-senha?erro=expirado')
  })

  it('outro erro do provedor vira link inválido, também na tela de pedido', async () => {
    expect(
      await destinationOf('?error=server_error&next=%2Fredefinir-senha'),
    ).toBe('/recuperar-senha?erro=invalido')
  })

  it('troca recusada (outro navegador, PKCE) pede um link novo', async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: { message: 'code verifier should be non-empty' },
    })

    expect(await destinationOf('?code=abc123&next=%2Fredefinir-senha')).toBe(
      '/recuperar-senha?erro=expirado',
    )
  })

  it('sem Supabase no ambiente, também pede um link novo', async () => {
    createSupabaseServerClient.mockResolvedValue(null)

    expect(await destinationOf('?code=abc123&next=%2Fredefinir-senha')).toBe(
      '/recuperar-senha?erro=invalido',
    )
  })

  it('nunca ecoa a descrição do provedor na URL de destino', async () => {
    const destination = await destinationOf(
      '?error=access_denied&error_description=Sua+sessao+expirou+va+para+evil.net&next=%2Fredefinir-senha',
    )

    expect(destination).not.toContain('evil.net')
    expect(destination).toBe('/recuperar-senha?erro=invalido')
  })
})

describe('destino do redirecionamento', () => {
  it.each([
    ['host externo', 'https://evil.net'],
    ['protocolo', '//evil.net'],
    ['rota interna fora da lista', '/configuracoes'],
    ['caminho relativo', '../../etc'],
  ])('ignora next %s e cai no dashboard', async (_label, next) => {
    const destination = await destinationOf(
      `?code=abc123&next=${encodeURIComponent(next)}`,
    )

    expect(destination).toBe('/dashboard')
    expect(destination).not.toContain('evil.net')
  })

  it.each([['/dashboard'], ['/redefinir-senha']])(
    'aceita %s, que está na allowlist',
    async (next) => {
      expect(
        await destinationOf(`?code=abc123&next=${encodeURIComponent(next)}`),
      ).toBe(next)
    },
  )
})
