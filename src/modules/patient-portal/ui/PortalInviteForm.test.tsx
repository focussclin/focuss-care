// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const signInWithOtp = vi.fn()
const createSupabaseBrowserClient = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => createSupabaseBrowserClient(),
}))

import { PortalInviteConfirm, PortalInviteForm } from './PortalInviteForm'

/**
 * O pedido do link de acesso — e as duas coisas que ele nunca pode fazer.
 *
 *  1. **Revelar o e-mail do convite.** O token viaja por WhatsApp, e-mail e
 *     papel. Se a tela mandasse o endereço junto, interceptar o link passaria a
 *     entregar dado pessoal do paciente mesmo sem conseguir aceitar nada.
 *  2. **Dizer se o e-mail existe.** Sucesso e falha terminam na mesma frase.
 *     Responder "não encontramos" faria desta página um oráculo: com uma lista
 *     de endereços, qualquer um descobriria quem é paciente daquela clínica — e
 *     num produto de saúde isso já diz coisas sobre a pessoa.
 */

const TOKEN = 'b'.repeat(64)

beforeEach(() => {
  signInWithOtp.mockReset().mockResolvedValue({ data: {}, error: null })
  createSupabaseBrowserClient.mockReset().mockReturnValue({
    auth: { signInWithOtp },
  })
})

afterEach(cleanup)

function renderForm(maskedEmail: string | null = 'a****@exemplo.com') {
  render(
    <PortalInviteForm
      token={TOKEN}
      maskedEmail={maskedEmail}
      clinicName="Clínica Aurora"
    />,
  )
}

async function submit(email: string) {
  fireEvent.change(screen.getByLabelText('Seu e-mail'), {
    target: { value: email },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Receber link de acesso' }))
}

describe('PortalInviteForm', () => {
  it('mostra a máscara, e o endereço completo em lugar nenhum', () => {
    renderForm('a****@exemplo.com')

    expect(screen.getByText('a****@exemplo.com')).toBeTruthy()
    // O campo nasce VAZIO: quem sabe o endereço é o dono da caixa de entrada.
    expect(
      (screen.getByLabelText('Seu e-mail') as HTMLInputElement).value,
    ).toBe('')
  })

  it('pede o link com o e-mail digitado, normalizado', async () => {
    renderForm()

    await submit('  ANA@Exemplo.COM  ')

    await waitFor(() =>
      expect(signInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'ana@exemplo.com' }),
      ),
    )
  })

  it('o retorno traz o token de volta, para o fluxo continuar', async () => {
    renderForm()

    await submit('ana@exemplo.com')

    await waitFor(() => expect(signInWithOtp).toHaveBeenCalled())

    const options = signInWithOtp.mock.calls[0][0].options
    const redirect = new URL(options.emailRedirectTo)

    expect(redirect.pathname).toBe('/auth/callback')
    expect(redirect.searchParams.get('next')).toBe(
      `/portal-paciente/convite/${TOKEN}`,
    )
  })

  it('o destino do retorno é sempre a MESMA origem', async () => {
    /*
     * O `next` é validado do outro lado por `safeNextPath`, que recusa qualquer
     * caminho que troque de origem. Aqui a origem sai de `window.location`, e
     * nunca de dado do convite — um link de retorno montado com host vindo do
     * servidor deixaria alguém apontar a sessão recém-aberta para fora.
     */
    renderForm()

    await submit('ana@exemplo.com')

    await waitFor(() => expect(signInWithOtp).toHaveBeenCalled())

    const redirect = new URL(
      signInWithOtp.mock.calls[0][0].options.emailRedirectTo,
    )

    expect(redirect.origin).toBe(window.location.origin)
  })

  it('recusa e-mail malformado sem ir ao provedor', async () => {
    renderForm()

    await submit('ana@')

    /*
     * Asserção pelo `role`, e não pelo texto solto: o parágrafo de erro do
     * `TextField` traz um ícone junto do texto, e `getByText` fica preso a esse
     * detalhe de marcação. O `role="alert"` é o contrato que importa — é ele
     * que faz o leitor de tela anunciar a recusa.
     *
     * `waitFor` porque o `onSubmit` é `async`: o `setError` acontece antes de
     * qualquer `await`, mas o render que o mostra só vem depois do tick.
     */
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/e-mail válido/i),
    )

    expect(signInWithOtp).not.toHaveBeenCalled()
  })

  it('sucesso e falha do provedor terminam na MESMA frase', async () => {
    renderForm()
    await submit('ana@exemplo.com')
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy())
    const sucesso = screen.getByRole('status').textContent

    cleanup()

    signInWithOtp.mockRejectedValueOnce(new Error('provider down'))
    renderForm()
    await submit('ana@exemplo.com')
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy())

    expect(screen.getByRole('status').textContent).toBe(sucesso)
  })

  it('a confirmação não afirma que o e-mail existe', async () => {
    renderForm()

    await submit('ninguem@exemplo.com')

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toMatch(/^Se este/),
    )
  })

  it('ambiente sem Supabase não finge que enviou', async () => {
    // Dizer "enviado" seria mentira — e esta falha não fala nada sobre o e-mail.
    createSupabaseBrowserClient.mockReturnValue(null)
    renderForm()

    await submit('ana@exemplo.com')

    await waitFor(() =>
      expect(screen.getByText(/não foi possível pedir o link/i)).toBeTruthy(),
    )
  })

  it('avisa que o link só funciona no endereço cadastrado', () => {
    renderForm()

    expect(screen.getByText(/o acesso não será liberado/i)).toBeTruthy()
  })
})

describe('PortalInviteConfirm', () => {
  it('o vínculo nasce de um clique, e não do carregamento da página', async () => {
    /*
     * Criar vínculo permanente entre uma conta e o prontuário de alguém dentro
     * de um GET é o tipo de coisa que um pré-carregador de link dispara sem
     * ninguém pedir.
     */
    const onConfirm = vi.fn().mockResolvedValue(null)

    render(
      <PortalInviteConfirm sessionEmail="ana@exemplo.com" onConfirm={onConfirm} />,
    )

    expect(onConfirm).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /confirmar meu acesso/i }))

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
  })

  it('mostra a recusa em vez de fechar em silêncio', async () => {
    const onConfirm = vi
      .fn()
      .mockResolvedValue('Este convite é para outro e-mail.')

    render(
      <PortalInviteConfirm sessionEmail="outro@exemplo.com" onConfirm={onConfirm} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /confirmar meu acesso/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Este convite é para outro e-mail.',
      ),
    )
  })

  it('diz com qual conta a pessoa está entrando', () => {
    // Sem isto, quem tem duas contas no navegador aceita com a errada e só
    // descobre quando o portal vem vazio.
    render(
      <PortalInviteConfirm sessionEmail="ana@exemplo.com" onConfirm={vi.fn()} />,
    )

    expect(screen.getByText('ana@exemplo.com')).toBeTruthy()
  })
})
