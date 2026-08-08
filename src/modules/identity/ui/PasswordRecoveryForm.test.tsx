// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O pedido do link de recuperação, com DOM.
 *
 * O teste central é o de **não-enumeração**: e-mail com conta, e-mail sem conta
 * e recusa do provedor precisam terminar na mesma tela, com a mesma frase. Isso
 * não aparece em `typecheck` e é fácil de perder numa refatoração que "melhora
 * as mensagens de erro" — daí estar trancado aqui.
 */

const resetPasswordForEmail = vi.fn()
const createSupabaseBrowserClient = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => createSupabaseBrowserClient(),
}))

const { PasswordRecoveryForm } = await import('./PasswordRecoveryForm')

/** Origem que o jsdom serve — a mesma que o componente lê de window.location. */
const ORIGIN = window.location.origin

function emailInput() {
  return screen.getByLabelText(/e-mail/i)
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /enviar link/i }))
}

async function fillAndSubmit(email: string) {
  fireEvent.change(emailInput(), { target: { value: email } })
  submit()
}

beforeEach(() => {
  vi.clearAllMocks()
  resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
  createSupabaseBrowserClient.mockReturnValue({
    auth: {
      resetPasswordForEmail: (email: string, options: unknown) =>
        resetPasswordForEmail(email, options),
    },
  })
})

afterEach(cleanup)

// ---------------------------------------------------------------------------

describe('envio do pedido', () => {
  it('manda o e-mail normalizado e o retorno para a tela de nova senha', async () => {
    render(<PasswordRecoveryForm />)
    await fillAndSubmit('  Maria@Clinica.com.BR  ')

    await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledTimes(1))

    const [email, options] = resetPasswordForEmail.mock.calls[0]
    expect(email).toBe('maria@clinica.com.br')
    expect(options.redirectTo).toBe(
      `${ORIGIN}/auth/callback?next=%2Fredefinir-senha`,
    )
  })

  it('parte do e-mail que veio do login', () => {
    render(<PasswordRecoveryForm defaultEmail="ana@exemplo.com" />)

    expect((emailInput() as HTMLInputElement).value).toBe('ana@exemplo.com')
  })

  it('mostra o estado de envio e bloqueia um segundo clique', async () => {
    // Sem `| null`: a analise de fluxo do TS estreitaria para `never` depois da
    // atribuicao dentro do callback, e a chamada la embaixo nao compilaria.
    let release = (): void => {}
    resetPasswordForEmail.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ data: {}, error: null })
        }),
    )

    render(<PasswordRecoveryForm />)
    await fillAndSubmit('maria@exemplo.com')

    // `jest-dom` não é dependência do projeto: a checagem é no DOM mesmo.
    await waitFor(() => {
      const button = screen.getByRole('button', {
        name: /enviando/i,
      }) as HTMLButtonElement
      expect(button.disabled).toBe(true)
    })

    release()
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy())
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(1)
  })
})

describe('não revela se o e-mail existe', () => {
  it.each([
    ['provedor aceitou', { data: {}, error: null }],
    [
      'provedor recusou',
      { data: null, error: { message: 'User not found', status: 400 } },
    ],
    [
      'limite de envios',
      {
        data: null,
        error: { message: 'For security purposes, you can only request this after 51 seconds', status: 429 },
      },
    ],
  ])('mostra a mesma frase quando o %s', async (_label, response) => {
    resetPasswordForEmail.mockResolvedValue(response)

    render(<PasswordRecoveryForm />)
    await fillAndSubmit('maria@exemplo.com')

    const status = await screen.findByRole('status')
    expect(status.textContent).toMatch(/^se existir uma conta/i)
    expect(status.textContent).not.toMatch(/not found/i)
    expect(status.textContent).not.toMatch(/51 seconds/i)
  })

  it('falha de transporte também termina na mesma frase', async () => {
    resetPasswordForEmail.mockRejectedValue(new Error('network'))

    render(<PasswordRecoveryForm />)
    await fillAndSubmit('maria@exemplo.com')

    const status = await screen.findByRole('status')
    expect(status.textContent).toMatch(/^se existir uma conta/i)
  })

  it('o formulário some depois do envio — não há como comparar duas tentativas', async () => {
    render(<PasswordRecoveryForm />)
    await fillAndSubmit('maria@exemplo.com')

    await screen.findByRole('status')
    expect(screen.queryByRole('button', { name: /enviar link/i })).toBeNull()
  })
})

describe('o que a tela recusa antes de chamar o servidor', () => {
  it.each([['vazio', ''], ['sem arroba', 'maria'], ['sem domínio', 'maria@']])(
    'não envia e-mail %s',
    async (_label, email) => {
      render(<PasswordRecoveryForm />)
      await fillAndSubmit(email)

      expect(await screen.findByText(/digite um e-mail válido/i)).toBeTruthy()
      expect(resetPasswordForEmail).not.toHaveBeenCalled()
    },
  )
})

describe('ambiente sem Supabase', () => {
  it('não diz "enviado" quando não há a quem pedir', async () => {
    createSupabaseBrowserClient.mockReturnValue(null)

    render(<PasswordRecoveryForm />)
    await fillAndSubmit('maria@exemplo.com')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/não foi possível enviar agora/i)
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('volta de um link que não funcionou', () => {
  it('exibe o motivo acima do formulário, sem esconder o campo', () => {
    render(
      <PasswordRecoveryForm linkError="O link expirou ou já tinha sido usado." />,
    )

    expect(screen.getByRole('alert').textContent).toMatch(/expirou/i)
    expect(screen.getByRole('button', { name: /enviar link/i })).toBeTruthy()
  })
})
