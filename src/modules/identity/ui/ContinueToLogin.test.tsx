// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ContinueToLogin } from './ContinueToLogin'

/**
 * O botão que leva da página 401 ao login, carregando o destino.
 *
 * Este componente é o que faz `unauthorized()` valer a pena: sem ele, servir o
 * 401 na URL original não adiantaria nada, porque ninguém leria essa URL.
 *
 * O caso hostil é o mais importante. O endereço vem da barra do navegador, e
 * alguém pode abrir `/pacientes/x?next=//evil.net` de propósito — o link
 * montado aqui não pode virar um salto para fora do domínio, nem mesmo antes de
 * o servidor recusar.
 */

function visit(path: string) {
  window.history.replaceState({}, '', path)
}

function href(): string {
  return screen.getByRole('link', { name: /entrar/i }).getAttribute('href') ?? ''
}

afterEach(() => {
  cleanup()
  visit('/')
})

describe('carrega de onde a pessoa veio', () => {
  it.each([
    ['paciente', '/pacientes/9019956f-bdd8-4d61-868d-09b02332dad0'],
    ['agenda', '/agenda'],
    ['prontuário', '/prontuarios'],
  ])('preserva %s', (_label, path) => {
    visit(path)
    render(<ContinueToLogin />)

    expect(href()).toBe(`/login?next=${encodeURIComponent(path)}`)
  })

  it('preserva também a query — o filtro faz parte do destino', () => {
    visit('/pacientes?q=maria&status=active')
    render(<ContinueToLogin />)

    expect(decodeURIComponent(href())).toContain('/pacientes?q=maria')
  })
})

describe('não polui a barra de endereços', () => {
  it('destino igual ao padrão não vira parâmetro', () => {
    visit('/dashboard')
    render(<ContinueToLogin />)

    expect(href()).toBe('/login')
  })

  it('raiz também não', () => {
    visit('/')
    render(<ContinueToLogin />)

    expect(href()).toBe('/login')
  })
})

describe('o link não sai do domínio', () => {
  it.each([
    ['sem esquema', '/pacientes?next=//evil.net'],
    ['host absoluto', '/pacientes?next=https://evil.net'],
  ])('%s continua apontando para dentro', (_label, path) => {
    visit(path)
    render(<ContinueToLogin />)

    /*
     * O `next` hostil está na QUERY do destino, não no destino: ele é
     * preservado como texto e o servidor o descarta. O que não pode acontecer é
     * o href do botão deixar de ser um caminho interno.
     */
    const resolved = new URL(href(), 'https://clinica.exemplo')
    expect(resolved.origin).toBe('https://clinica.exemplo')
    expect(resolved.pathname).toBe('/login')
  })

  it('barra codificada no caminho não vira salto para fora', () => {
    /*
     * O caso `//evil.net` NÃO É CONSTRUÍVEL aqui, e a tentativa de escrevê-lo
     * ensinou por quê: o próprio navegador recusa (`replaceState() cannot
     * update history to the URL http://evil.net/`). `window.location.pathname`
     * é, por definição, um caminho da origem atual — então a entrada deste
     * componente já nasce same-origin.
     *
     * O que sobra é o que o servidor decodifica depois. `safeNextPath` continua
     * no caminho por isso, e não por medo do impossível.
     */
    visit('/pacientes/%2f%2fevil.net')
    render(<ContinueToLogin />)

    const resolved = new URL(href(), 'https://clinica.exemplo')
    expect(resolved.origin).toBe('https://clinica.exemplo')
    expect(resolved.pathname).toBe('/login')
  })
})
