// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { OauthErrorNotice } from './OauthErrorNotice'

/**
 * O aviso de retorno do OAuth — a única parte dinâmica de `/login`.
 *
 * É Server Component assíncrono, então o teste o chama como função e renderiza
 * o elemento que ele devolve. Sem servidor, sem rede: o que entra é a promessa
 * de `searchParams`, exatamente como a rota entrega.
 *
 * O caso que mais importa é o último: `?error=` é URL, ou seja, entrada de quem
 * clicou no link. Se a tela ecoasse o conteúdo dele, qualquer um escreveria a
 * mensagem exibida na página de login — "sua sessão expirou, confirme a senha
 * em outro endereço" chega junto com o link.
 */

afterEach(cleanup)

async function renderNotice(error: unknown) {
  const element = await OauthErrorNotice({
    searchParams: Promise.resolve({ error } as { error?: string | string[] }),
  })

  if (element === null) return null

  render(element)
  return screen.getByRole('alert')
}

describe('quando há erro de OAuth na URL', () => {
  it.each([
    ['oauth_cancelled', /cancelado/i],
    ['oauth_error', /não foi possível concluir/i],
    ['invalid_callback', /retorno da autenticação é inválido/i],
    ['connection_error', /conectar ao serviço/i],
  ])('traduz %s para a frase da tela', async (code, expected) => {
    const alert = await renderNotice(code)

    expect(alert?.textContent).toMatch(expected)
  })

  it('código desconhecido cai na frase genérica, e não some', async () => {
    const alert = await renderNotice('algo_que_nao_existe')

    expect(alert?.textContent).toMatch(/não foi possível concluir/i)
  })

  it('vale o primeiro quando o parâmetro vem repetido', async () => {
    const alert = await renderNotice(['oauth_cancelled', 'connection_error'])

    expect(alert?.textContent).toMatch(/cancelado/i)
    expect(alert?.textContent).not.toMatch(/conectar ao serviço/i)
  })
})

describe('quando não há erro', () => {
  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['não-string', 42],
    ['lista vazia', []],
  ])('não renderiza nada com %s', async (_label, error) => {
    expect(await renderNotice(error)).toBeNull()
  })
})

describe('o que a URL NÃO consegue escrever na tela', () => {
  it('não ecoa o conteúdo do parâmetro', async () => {
    const forjada =
      'Sua sessão expirou. Confirme sua senha em focuss-care.exemplo.net'

    const alert = await renderNotice(forjada)

    expect(alert?.textContent).toMatch(/não foi possível concluir/i)
    expect(alert?.textContent).not.toContain('focuss-care.exemplo.net')
    expect(alert?.textContent).not.toContain(forjada)
  })

  it('não injeta marcação vinda da URL', async () => {
    const alert = await renderNotice('<img src=x onerror=alert(1)>')

    expect(alert?.innerHTML).not.toContain('<img')
    expect(alert?.textContent).toMatch(/não foi possível concluir/i)
  })
})
