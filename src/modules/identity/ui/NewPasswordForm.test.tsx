// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A tela de nova senha, com DOM (P-RS).
 *
 * A Server Action é um mock — o que ela decide (sessão validada no servidor,
 * força da senha, encerramento da sessão) está em
 * `updatePassword.action.test.ts`. Aqui se verifica o que a tela faz com cada
 * desfecho, incluindo o mais fácil de esquecer: quando o link morre com o
 * formulário aberto, insistir num campo que nunca vai salvar é cruel — a tela
 * precisa oferecer o caminho de pedir outro link.
 */

const updatePasswordAction = vi.fn()
const replace = vi.fn()
const refresh = vi.fn()

vi.mock('../actions/updatePassword.action', () => ({
  updatePasswordAction: (input: unknown) => updatePasswordAction(input),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
}))

const { NewPasswordForm } = await import('./NewPasswordForm')

function fill(password: string, confirmation = password) {
  fireEvent.change(screen.getByLabelText(/^nova senha$/i), {
    target: { value: password },
  })
  fireEvent.change(screen.getByLabelText(/repita a nova senha/i), {
    target: { value: confirmation },
  })
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /salvar/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
  updatePasswordAction.mockResolvedValue({ ok: true })
})

afterEach(cleanup)

// ---------------------------------------------------------------------------

describe('sucesso', () => {
  it('salva e devolve ao login com o aviso do que aconteceu', async () => {
    render(<NewPasswordForm />)
    fill('clinica2026')
    submit()

    await waitFor(() =>
      expect(updatePasswordAction).toHaveBeenCalledWith({
        password: 'clinica2026',
        passwordConfirmation: 'clinica2026',
      }),
    )

    /*
     * O destino é o login, e não o dashboard: a action encerra a sessão aberta
     * pelo link. Sem o `aviso`, a pessoa cairia numa tela de login sem entender
     * por que precisa entrar de novo — e concluiria que a troca falhou.
     */
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/login?aviso=senha-redefinida'),
    )
    expect(refresh).toHaveBeenCalled()
  })

  it('mostra o estado de envio enquanto salva', async () => {
    // Sem `| null`: a analise de fluxo do TS estreitaria para `never` depois da
    // atribuicao dentro do callback, e a chamada la embaixo nao compilaria.
    let release = (): void => {}
    updatePasswordAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true })
        }),
    )

    render(<NewPasswordForm />)
    fill('clinica2026')
    submit()

    await waitFor(() => {
      const button = screen.getByRole('button', {
        name: /salvando/i,
      }) as HTMLButtonElement
      expect(button.disabled).toBe(true)
    })

    release()
  })
})

describe('o que a tela barra antes de chamar o servidor', () => {
  it('recusa senhas diferentes, e aponta o campo de confirmação', async () => {
    render(<NewPasswordForm />)
    fill('clinica2026', 'clinica2027')
    submit()

    expect(
      await screen.findByText(/as duas senhas precisam ser iguais/i),
    ).toBeTruthy()
    expect(updatePasswordAction).not.toHaveBeenCalled()
  })

  it.each([
    ['curta', 'abc1', /pelo menos 8 caracteres/i],
    ['sem número', 'clinicasegura', /pelo menos um número/i],
    ['sem letra', '123456789', /pelo menos uma letra/i],
  ])('recusa senha %s', async (_label, password, message) => {
    render(<NewPasswordForm />)
    fill(password)
    submit()

    expect(await screen.findByText(message)).toBeTruthy()
    expect(updatePasswordAction).not.toHaveBeenCalled()
  })
})

describe('quando o servidor recusa', () => {
  it('mostra a mensagem e mantém o formulário para nova tentativa', async () => {
    updatePasswordAction.mockResolvedValue({
      ok: false,
      error: 'Não foi possível salvar a nova senha. Tente novamente em instantes.',
    })

    render(<NewPasswordForm />)
    fill('clinica2026')
    submit()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/não foi possível salvar/i)
    expect(screen.getByRole('button', { name: /salvar/i })).toBeTruthy()
    expect(replace).not.toHaveBeenCalled()
  })

  it('senha repetida vira erro do campo, não banner solto', async () => {
    updatePasswordAction.mockResolvedValue({
      ok: false,
      error: 'Escolha uma senha diferente da anterior.',
      fieldErrors: { password: 'Escolha uma senha diferente da anterior.' },
    })

    render(<NewPasswordForm />)
    fill('clinica2026')
    submit()

    expect(
      await screen.findAllByText(/escolha uma senha diferente/i),
    ).not.toHaveLength(0)
  })

  it('falha de transporte não deixa a tela em branco', async () => {
    updatePasswordAction.mockRejectedValue(new Error('network'))

    render(<NewPasswordForm />)
    fill('clinica2026')
    submit()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/não foi possível salvar/i)
  })
})

describe('link vencido com o formulário aberto', () => {
  it('troca o formulário pelo caminho de pedir outro link', async () => {
    updatePasswordAction.mockResolvedValue({
      ok: false,
      sessionExpired: true,
      error: 'Este link não é mais válido.',
    })

    render(<NewPasswordForm />)
    fill('clinica2026')
    submit()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/não é mais válido/i)

    const link = screen.getByRole('link', { name: /pedir um novo link/i })
    expect(link.getAttribute('href')).toBe('/recuperar-senha')

    // O campo some: insistir num formulário que nunca vai salvar é cruel.
    expect(screen.queryByLabelText(/^nova senha$/i)).toBeNull()
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('acessibilidade do campo de senha', () => {
  it('o botão de mostrar/ocultar diz qual ação vai executar', () => {
    render(<NewPasswordForm />)

    const toggle = screen.getByRole('button', { name: /mostrar senha/i })
    fireEvent.click(toggle)

    expect(screen.getByRole('button', { name: /ocultar senha/i })).toBeTruthy()
  })

  it('mostrar senha vale para os dois campos — repetir às cegas não ajuda', () => {
    render(<NewPasswordForm />)

    fireEvent.click(screen.getByRole('button', { name: /mostrar senha/i }))

    expect(
      (screen.getByLabelText(/^nova senha$/i) as HTMLInputElement).type,
    ).toBe('text')
    expect(
      (screen.getByLabelText(/repita a nova senha/i) as HTMLInputElement).type,
    ).toBe('text')
  })
})
