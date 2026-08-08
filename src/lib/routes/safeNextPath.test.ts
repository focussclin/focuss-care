import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AFTER_LOGIN,
  hasCustomNextPath,
  safeNextPath,
} from './safeNextPath'

/**
 * O validador de destino pós-login.
 *
 * É o arquivo que transforma um parâmetro de URL — escrito por quem manda o
 * link — em um `redirect()` de servidor. Se ele errar, o produto ganha um
 * **redirecionamento aberto**: alguém acaba de digitar a senha no nosso domínio
 * e é levado para outro, com a confiança que a nossa tela emprestou.
 *
 * Por isso a maior parte dos casos abaixo é de ataque, não de uso. Os vetores
 * `//evil.net` e `/\evil.net` são os que enganam validação artesanal: não têm
 * "http", não têm dois pontos, e mudam de origem mesmo assim.
 */

describe('caminhos internos aceitos', () => {
  it.each([
    ['rota simples', '/pacientes'],
    ['rota dinâmica', '/pacientes/9019956f-bdd8-4d61-868d-09b02332dad0'],
    ['subrota', '/pacientes/abc/historico'],
    ['convite com token', '/convite/tok_123abc'],
    ['com query', '/pacientes?q=maria&status=active'],
  ])('preserva %s', (_label, path) => {
    expect(safeNextPath(path)).toBe(path)
  })

  it('descarta o fragmento, que nunca chega ao servidor', () => {
    expect(safeNextPath('/pacientes?q=maria#lista')).toBe('/pacientes?q=maria')
  })
})

describe('redirecionamento aberto', () => {
  it.each([
    ['host absoluto', 'https://evil.net'],
    ['sem esquema', '//evil.net'],
    ['barra invertida — o vetor clássico', '/\\evil.net'],
    ['barras demais', '////evil.net'],
    ['esquema sem barras', 'http:evil.net'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['com credenciais', 'https://user:senha@evil.net/'],
    ['barra invertida dupla', '\\\\evil.net'],
    ['espaço antes do host', '  //evil.net'],
  ])('recusa %s', (_label, hostile) => {
    const destination = safeNextPath(hostile)

    expect(destination).toBe(DEFAULT_AFTER_LOGIN)
    expect(destination).not.toContain('evil.net')
    expect(destination).not.toContain('alert')
  })

  it('nenhum destino devolvido sai do domínio', () => {
    const vectors = [
      '/pacientes',
      '//evil.net',
      '/\\evil.net',
      'https://evil.net/pacientes',
      '/%2f%2fevil.net',
    ]

    for (const vector of vectors) {
      // Resolver o resultado contra qualquer origem tem que devolver a MESMA
      // origem — é a propriedade que o chamador precisa poder assumir.
      const resolved = new URL(safeNextPath(vector), 'https://clinica.exemplo')
      expect(resolved.origin).toBe('https://clinica.exemplo')
    }
  })
})

describe('laços de volta para a autenticação', () => {
  it.each([
    ['/login'],
    ['/login?next=%2Fpacientes'],
    ['/cadastro'],
    ['/auth/callback?code=abc'],
  ])('recusa %s, que devolveria a pessoa para onde ela veio', (path) => {
    expect(safeNextPath(path)).toBe(DEFAULT_AFTER_LOGIN)
  })

  it('não confunde uma rota que apenas começa com o mesmo texto', () => {
    // `/loginhistorico` não é subcaminho de `/login`.
    expect(safeNextPath('/loginhistorico')).toBe('/loginhistorico')
  })

  it('aceita /redefinir-senha — é o destino do link de recuperação', () => {
    /*
     * Este é o caso que quase virou regressão: tratar toda tela de senha como
     * laço quebraria o fluxo inteiro de P-RS, porque é para lá que o callback
     * leva depois de trocar o código do e-mail por sessão.
     */
    expect(safeNextPath('/redefinir-senha')).toBe('/redefinir-senha')
  })
})

describe('entrada inútil', () => {
  it.each([
    ['ausente', undefined],
    ['nula', null],
    ['número', 42],
    ['objeto', { path: '/pacientes' }],
    ['vazia', ''],
    ['a raiz, que já redireciona sozinha', '/'],
  ])('cai no padrão com entrada %s', (_label, raw) => {
    expect(safeNextPath(raw)).toBe(DEFAULT_AFTER_LOGIN)
  })

  it('recusa caminho absurdamente longo', () => {
    expect(safeNextPath(`/${'a'.repeat(600)}`)).toBe(DEFAULT_AFTER_LOGIN)
  })

  it('respeita o padrão que o chamador escolher', () => {
    expect(safeNextPath('https://evil.net', '/onboarding')).toBe('/onboarding')
  })
})

describe('vale a pena carregar o next adiante?', () => {
  it.each([
    ['rota real', '/convite/tok_123', true],
    ['o próprio padrão', DEFAULT_AFTER_LOGIN, false],
    ['host externo', 'https://evil.net', false],
    ['ausente', undefined, false],
  ])('%s → %s', (_label, raw, expected) => {
    expect(hasCustomNextPath(raw)).toBe(expected)
  })
})
