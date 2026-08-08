// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O login, com DOM — a parte que carrega o destino.
 *
 * O `?next=` é lido de `window.location` **no momento do envio**, e não de
 * `searchParams` na rota. A diferença não é estilo: ler a URL no servidor tiraria
 * `/login` do prerender, que foi exatamente o trabalho de P-C2. Este arquivo
 * tranca as duas propriedades ao mesmo tempo — o destino chega à action, e a
 * leitura acontece no cliente.
 */

/*
 * O checkbox "Lembrar de mim" é do Radix, que mede o elemento com
 * `ResizeObserver` — API que o jsdom não implementa. O stub não finge medir
 * nada: só existe para o componente montar, que é o que este arquivo testa.
 */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as never

const signInAction = vi.fn()
const signInWithOAuth = vi.fn()
const createSupabaseBrowserClient = vi.fn()

vi.mock('../actions/signIn.action', () => ({
  signInAction: (values: unknown, next?: string) => signInAction(values, next),
}))

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => createSupabaseBrowserClient(),
}))

const { LoginFormContainer } = await import('./LoginForm.container')

function visit(search: string) {
  window.history.replaceState({}, '', `/login${search}`)
}

async function signIn() {
  fireEvent.change(screen.getByLabelText(/^e-mail$/i), {
    target: { value: 'maria@exemplo.com' },
  })
  fireEvent.change(screen.getByLabelText(/^senha$/i), {
    target: { value: 'clinica2026' },
  })
  fireEvent.click(screen.getByRole('button', { name: /entrar/i }))
}

/** O `next` com que a action foi chamada. */
async function nextSentToAction(): Promise<string | undefined> {
  await waitFor(() => expect(signInAction).toHaveBeenCalledTimes(1))
  return signInAction.mock.calls[0][1]
}

beforeEach(() => {
  vi.clearAllMocks()
  signInAction.mockResolvedValue({ ok: true })
  signInWithOAuth.mockResolvedValue({
    data: { url: 'https://accounts.google.com/o/oauth2/auth?x=1' },
    error: null,
  })
  createSupabaseBrowserClient.mockReturnValue({
    auth: { signInWithOAuth: (opts: unknown) => signInWithOAuth(opts) },
  })
  visit('')
})

afterEach(cleanup)

// ---------------------------------------------------------------------------

describe('entrada por senha', () => {
  it('sem ?next= na URL, não inventa destino', async () => {
    render(<LoginFormContainer />)
    await signIn()

    expect(await nextSentToAction()).toBeUndefined()
  })

  it('carrega o destino que o proxy escreveu', async () => {
    visit('?next=%2Fpacientes%2F9019956f-bdd8-4d61-868d-09b02332dad0')
    render(<LoginFormContainer />)
    await signIn()

    expect(await nextSentToAction()).toBe(
      '/pacientes/9019956f-bdd8-4d61-868d-09b02332dad0',
    )
  })

  it('carrega o convite — o caso que estava se perdendo', async () => {
    visit('?next=%2Fconvite%2Ftok_abc123')
    render(<LoginFormContainer />)
    await signIn()

    expect(await nextSentToAction()).toBe('/convite/tok_abc123')
  })

  it('repassa destino hostil sem tratar — quem decide é o servidor', async () => {
    /*
     * A tela NÃO é a fronteira de segurança aqui, e fingir que é seria pior:
     * daria a impressão de que o servidor pode confiar no que recebe. A action
     * valida com `safeNextPath`, e é lá que o teste do vetor mora.
     */
    visit('?next=https%3A%2F%2Fevil.net')
    render(<LoginFormContainer />)
    await signIn()

    expect(await nextSentToAction()).toBe('https://evil.net')
  })
})

describe('entrada com Google', () => {
  async function clickGoogle() {
    fireEvent.click(screen.getByRole('button', { name: /google/i }))
    await waitFor(() => expect(signInWithOAuth).toHaveBeenCalledTimes(1))
    return new URL(signInWithOAuth.mock.calls[0][0].options.redirectTo)
  }

  it('manda o retorno para o callback, com o destino validado', async () => {
    visit('?next=%2Fconvite%2Ftok_abc123')
    render(<LoginFormContainer />)

    const redirectTo = await clickGoogle()

    expect(redirectTo.pathname).toBe('/auth/callback')
    expect(redirectTo.searchParams.get('next')).toBe('/convite/tok_abc123')
  })

  it('destino hostil não atravessa o Google', async () => {
    visit('?next=%2F%2Fevil.net')
    render(<LoginFormContainer />)

    const redirectTo = await clickGoogle()

    expect(redirectTo.searchParams.get('next')).toBe('/dashboard')
    expect(redirectTo.toString()).not.toContain('evil.net')
  })

  it('o retorno aponta para a origem em que a pessoa está', async () => {
    render(<LoginFormContainer />)

    const redirectTo = await clickGoogle()

    expect(redirectTo.origin).toBe(window.location.origin)
  })
})

describe('estados do envio', () => {
  it('recusa do servidor vira mensagem, sem limpar a tela', async () => {
    signInAction.mockResolvedValue({
      ok: false,
      error: 'Não foi possível entrar. Confira seus dados e tente novamente.',
    })

    render(<LoginFormContainer />)
    await signIn()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/não foi possível entrar/i)
  })

  it('falha de transporte não deixa a tela muda', async () => {
    signInAction.mockRejectedValue(new Error('network'))

    render(<LoginFormContainer />)
    await signIn()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/algo deu errado/i)
  })
})
