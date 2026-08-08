import { describe, expect, it } from 'vitest'

import { displayNameOf, type SessionState, type SessionUser } from './session'

/**
 * Quem a casca chama pelo nome.
 *
 * O defeito que este arquivo tranca foi achado na auditoria de 08/08/2026: o
 * painel decidia por `session.status === 'active' ? nome real : nome de exemplo`.
 * Os estados `needs-onboarding` e `claims-stale` são **pessoas reais,
 * autenticadas, com nome próprio**, e caíam no lado errado do ternário. Na
 * prática o layout redireciona os dois antes de a tela pintar — ou seja, a
 * proteção era o desvio de OUTRO arquivo, não a decisão deste.
 *
 * Chamar alguém pelo nome de outra pessoa é barato de escrever e caro de ver
 * acontecendo, ainda mais quando o nome de exemplo é o de uma pessoa de verdade
 * nos dados de demonstração.
 *
 * A tabela abaixo é a lista **completa** dos estados de `SessionState`. Um
 * estado novo que não esteja aqui não quebra a compilação — quebra o último
 * teste do arquivo, que confere a contagem.
 */

const DEMO = 'Nome De Demonstração'

const user: SessionUser = {
  id: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
  email: 'maria@exemplo.com',
  displayName: 'Maria Silva',
  avatarUrl: null,
}

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'

const STATES: Array<{ label: string; session: SessionState; expected: string }> =
  [
    {
      label: 'not-configured (demonstração local)',
      session: { status: 'not-configured' },
      expected: DEMO,
    },
    {
      label: 'anonymous (sem sessão)',
      session: { status: 'anonymous' },
      expected: DEMO,
    },
    {
      label: 'needs-onboarding (autenticado, sem clínica)',
      session: { status: 'needs-onboarding', user },
      expected: 'Maria Silva',
    },
    {
      label: 'claims-stale (autenticado, JWT sem as claims)',
      session: { status: 'claims-stale', user, clinicId: CLINIC },
      expected: 'Maria Silva',
    },
    {
      label: 'active (autenticado, com clínica)',
      session: {
        status: 'active',
        user,
        clinicId: CLINIC,
        clinicName: 'Clínica Exemplo',
        role: 'owner',
      },
      expected: 'Maria Silva',
    },
  ]

describe('nome exibido por estado de sessão', () => {
  it.each(STATES)('$label → $expected', ({ session, expected }) => {
    expect(displayNameOf(session, DEMO)).toBe(expected)
  })
})

describe('o nome de demonstração não vaza para gente de verdade', () => {
  it.each(
    STATES.filter((state) => state.expected !== DEMO).map((state) => [
      state.label,
      state.session,
    ]),
  )('%s nunca recebe o nome de exemplo', (_label, session) => {
    expect(displayNameOf(session as SessionState, DEMO)).not.toBe(DEMO)
  })

  it('usa o nome de exemplo SÓ quando não há usuário na sessão', () => {
    const withDemoName = STATES.filter(
      (state) => displayNameOf(state.session, DEMO) === DEMO,
    ).map((state) => state.session.status)

    expect(withDemoName).toEqual(['not-configured', 'anonymous'])
  })
})

describe('cobertura dos estados', () => {
  it('a tabela cobre todos os `status` de SessionState', () => {
    /*
     * Se um estado novo entrar em `SessionState`, este teste falha e obriga a
     * decisão explícita: a pessoa daquele estado tem nome próprio ou não?
     * Sem isto, o estado novo herdaria em silêncio o lado do `in` que calhar.
     */
    const covered = STATES.map((state) => state.session.status).sort()

    expect(covered).toEqual(
      [
        'active',
        'anonymous',
        'claims-stale',
        'needs-onboarding',
        'not-configured',
      ].sort(),
    )
  })
})
