import { describe, expect, it } from 'vitest'

import { MEMBERSHIP_ROLES } from '@/lib/auth/permissions'

import { navItems, visibleNavItems } from './navigation'

/**
 * O menu não pode mentir.
 *
 * Duas classes de mentira, e as duas já estiveram aqui: item que promete uma
 * rota inexistente, e item que oferece um caminho que termina em 403. A segunda
 * é a pior — a pessoa clica, é recusada, e aprende que o sistema é imprevisível.
 */

/** Rotas que existem em `src/app/(app)`. Espelhada à mão, de propósito. */
const EXISTING_ROUTES = new Set([
  '/dashboard',
  '/agenda',
  '/pacientes',
  '/atendimentos',
  '/prontuarios',
  '/equipe',
  '/configuracoes',
  '/relatorios',
  '/financeiro',
  '/convenios',
  '/whatsapp',
  '/chat-ia',
  '/automacoes',
])

describe('navItems', () => {
  it('todo item HABILITADO aponta para uma rota que existe', () => {
    const broken = navItems
      .filter((item) => !item.disabled)
      .filter((item) => !EXISTING_ROUTES.has(item.href))

    // Um item habilitado sem rota e um 404 esperando alguem clicar.
    expect(broken.map((item) => item.href)).toEqual([])
  })

  it('nenhum item carrega query string', () => {
    /*
     * Quatro itens apontavam para `/configuracoes?tab=…`, e a rota nao le
     * `tab`. Endereco que promete uma aba inexistente e link quebrado com
     * aparencia de funcionar.
     */
    expect(navItems.filter((item) => item.href.includes('?'))).toEqual([])
  })

  it('não oferece Pagamentos nem Caixa separados do Financeiro', () => {
    // B-01 entregou os dois dentro de /financeiro. Itens proprios marcados
    // "em breve" diriam que a clinica ainda nao pode receber.
    const hrefs = navItems.map((item) => item.href)

    expect(hrefs).not.toContain('/pagamentos')
    expect(hrefs).not.toContain('/caixa')
    expect(hrefs).toContain('/financeiro')
  })
})

describe('visibleNavItems', () => {
  it('esconde de `finance` o que ele não pode abrir', () => {
    const hrefs = visibleNavItems('finance').map((item) => item.href)

    // `finance` nao tem appointment.read, encounter.read nem record.read.
    expect(hrefs).not.toContain('/agenda')
    expect(hrefs).not.toContain('/atendimentos')
    expect(hrefs).not.toContain('/prontuarios')

    // E tem o que precisa para trabalhar.
    expect(hrefs).toContain('/financeiro')
    expect(hrefs).toContain('/convenios')
    expect(hrefs).toContain('/relatorios')
  })

  it('esconde de `receptionist` prontuário e financeiro', () => {
    const hrefs = visibleNavItems('receptionist').map((item) => item.href)

    expect(hrefs).not.toContain('/prontuarios')
    expect(hrefs).not.toContain('/financeiro')
    expect(hrefs).not.toContain('/convenios')

    expect(hrefs).toContain('/agenda')
    expect(hrefs).toContain('/atendimentos')
  })

  it('`owner` enxerga tudo o que está habilitado', () => {
    const visible = visibleNavItems('owner').map((item) => item.href)
    const all = navItems.map((item) => item.href)

    expect(visible).toEqual(all)
  })

  it('papel ausente devolve o menu inteiro — é a demonstração', () => {
    // Sem vinculo nao ha papel a consultar, e a demonstracao existe para
    // mostrar a interface inteira.
    expect(visibleNavItems(undefined)).toEqual(navItems)
  })

  it('sessão sem papel na clínica não vê rota protegida', () => {
    // `null` e diferente de `undefined`: ha sessao, e ela nao tem papel aqui.
    const hrefs = visibleNavItems(null).map((item) => item.href)

    expect(hrefs).not.toContain('/prontuarios')
    expect(hrefs).toContain('/dashboard')
  })

  it('todo papel do enum enxerga pelo menos o painel', () => {
    for (const role of MEMBERSHIP_ROLES) {
      const hrefs = visibleNavItems(role).map((item) => item.href)
      expect(hrefs).toContain('/dashboard')
    }
  })
})
