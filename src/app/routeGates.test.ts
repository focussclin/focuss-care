import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

import { navItems } from '@/components/layout/navigation'

/**
 * O que o menu promete proteger, a rota exige de verdade.
 *
 * # A lacuna que este teste fecha
 *
 * `navItem.permission` existe por I-05 — "não oferecer o que não funciona" — e o
 * JSDoc dele já avisa, com todas as letras, que **não é a fronteira de
 * segurança**: a rota é. O problema é que nada verificava se a rota cumpria a
 * parte dela.
 *
 * Em 10/08/2026 essa distância tinha um caso real e caro: `appointment.read` era
 * declarado no item "Agenda" e **não era exigido em rota nenhuma do produto**.
 * `finance` é o único papel sem essa permissão, e a matriz de
 * `lib/auth/permissions.ts` diz explicitamente que ele não alcança agenda. O
 * menu escondia o item — e a URL continuava servindo a semana inteira da
 * clínica para quem a digitasse.
 *
 * Ninguém notou porque a falha é silenciosa nos dois sentidos: quem não deveria
 * ver não recebe erro, e quem revisa vê um item de menu com `permission` e
 * conclui que está protegido.
 *
 * # Por que a checagem é sobre o TEXTO do arquivo
 *
 * Ela é grosseira de propósito. Renderizar cada rota com cinco papéis exigiria
 * subir Supabase, sessão e RLS — e o que se quer garantir aqui é mais simples e
 * mais durável: **a permissão que o menu declara aparece na decisão da rota**.
 * Um teste que passa por acidente é possível (alguém pode escrever `can(role,
 * 'x')` e ignorar o resultado), mas o caso que importa — a permissão que não
 * aparece em lugar nenhum — é pego sempre.
 */

const APP_DIR = join(process.cwd(), 'src', 'app')

/**
 * Rotas de `(app)` que qualquer membro da clínica alcança, e o porquê.
 *
 * Estar aqui é uma DECISÃO, não uma isenção: significa que alguém olhou o que a
 * tela mostra e concluiu que vínculo com a clínica basta. Rota nova que não
 * caiba em nenhuma das duas listas quebra o teste — que é o ponto.
 */
const MEMBER_ONLY_ROUTES: Record<string, string> = {
  '/dashboard':
    'Painel de entrada. O cartão de pulso financeiro já checa `invoice.read` por dentro; o resto é a agenda do próprio dia e a atividade da clínica, que todo membro acompanha.',
  '/configuracoes':
    'A aba de perfil é sempre do próprio usuário e não exige papel nenhum. O bloco da clínica checa `clinic.settings` por dentro, e a tela declara em texto o que não configura.',
  '/whatsapp':
    'Mostra apenas o ESTADO da conexão (conectado, pendente, ausente). Credencial nenhuma chega à tela; salvar segredo é a action `integrationCredential.save`, que exige `clinic.settings`.',
  '/chat-ia':
    'Mostra o estado do assistente e a regra P9 que vale antes de ele existir. Sem dado de paciente e sem credencial.',
  '/automacoes':
    'Lista as regras cadastradas e declara que não há executor. Sem dado de paciente e sem credencial.',
}

function collectFiles(dir: string, name: string): string[] {
  const found: string[] = []

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)

    if (statSync(full).isDirectory()) {
      found.push(...collectFiles(full, name))
    } else if (entry === name) {
      found.push(full)
    }
  }

  return found
}

/** `src/app/(app)/agenda/page.tsx` → `/agenda`. */
function routeOf(file: string): string {
  const relative = file
    .slice(APP_DIR.length)
    .split(sep)
    .join('/')
    .replace(/\/page\.tsx$/, '')
    .replace(/\/\([^/]+\)/g, '')

  return relative === '' ? '/' : relative
}

/** Só as rotas privadas: `(auth)` e a raiz não têm papel para checar. */
function appRouteFiles(): { route: string; file: string; source: string }[] {
  return collectFiles(APP_DIR, 'page.tsx')
    .filter((file) => file.split(sep).includes('(app)'))
    .map((file) => ({
      route: routeOf(file),
      file,
      source: readFileSync(file, 'utf8'),
    }))
    .sort((a, b) => a.route.localeCompare(b.route))
}

/**
 * O arquivo decide alguma coisa com esta permissão?
 *
 * Aceita `can(role, 'x')` e `can(session.role, 'x')` — os dois aparecem no
 * produto, porque algumas rotas já leem a sessão inteira por outro motivo e
 * seria desperdício pedir o papel de novo.
 */
function checksPermission(source: string, permission: string): boolean {
  return new RegExp(`can\\(\\s*[\\w.]+\\s*,\\s*'${permission}'\\s*\\)`).test(
    source,
  )
}

describe('portões de rota', () => {
  const files = appRouteFiles()

  it('encontra as rotas privadas', () => {
    // Sem isto, um erro no varredor faria a suíte passar por lista vazia.
    expect(files.length).toBeGreaterThan(20)
  })

  it('toda permissão declarada no menu é exigida pela rota', () => {
    const byRoute = new Map(files.map((entry) => [entry.route, entry]))

    const semPortao = navItems
      .filter((item) => item.permission)
      .filter((item) => byRoute.has(item.href))
      .filter((item) => {
        const entry = byRoute.get(item.href)!

        return !checksPermission(entry.source, item.permission!)
      })
      .map((item) => `${item.href} não exige ${item.permission}`)

    expect(semPortao).toEqual([])
  })

  /*
   * A permissão só vale se ela NEGAR. Um `can(...)` cujo resultado vira um
   * booleano de UI esconde o botão e entrega o dado do mesmo jeito — que é
   * exatamente o que acontecia na ficha do paciente antes de 10/08/2026.
   */
  it('toda rota do menu com permissão chama forbidden()', () => {
    const byRoute = new Map(files.map((entry) => [entry.route, entry]))

    const semRecusa = navItems
      .filter((item) => item.permission)
      .filter((item) => byRoute.has(item.href))
      .filter((item) => !byRoute.get(item.href)!.source.includes('forbidden()'))
      .map((item) => item.href)

    expect(semRecusa).toEqual([])
  })

  it('rota privada sem portão está registrada com motivo', () => {
    const gated = new Set(
      navItems.filter((item) => item.permission).map((item) => item.href),
    )

    const semNada = files
      .filter((entry) => !gated.has(entry.route))
      .filter((entry) => !(entry.route in MEMBER_ONLY_ROUTES))
      .filter((entry) => !entry.source.includes('forbidden()'))
      .map((entry) => entry.route)

    expect(semNada).toEqual([])
  })

  it('nada registrado como aberto passou a ter portão de menu', () => {
    /*
     * O dia em que uma destas ganhar `permission` no menu, esta linha falha e
     * obriga a tirar a entrada — que é como o registro deixa de envelhecer.
     */
    const comPermissao = new Set(
      navItems.filter((item) => item.permission).map((item) => item.href),
    )

    const contraditorias = Object.keys(MEMBER_ONLY_ROUTES).filter((route) =>
      comPermissao.has(route),
    )

    expect(contraditorias).toEqual([])
  })

  it('nada registrado como aberto deixou de existir', () => {
    const rotas = new Set(files.map((entry) => entry.route))

    const sumiram = Object.keys(MEMBER_ONLY_ROUTES).filter(
      (route) => !rotas.has(route),
    )

    expect(sumiram).toEqual([])
  })

  it('todo motivo registrado diz alguma coisa', () => {
    for (const [route, reason] of Object.entries(MEMBER_ONLY_ROUTES)) {
      expect(reason.length, route).toBeGreaterThan(60)

      /*
       * O marcador é `TODO` MAIÚSCULO e palavra inteira — nunca minúsculo.
       *
       * Em texto português "todo", "toda" e "todos" aparecem o tempo inteiro, e
       * um `toLowerCase().includes('todo')` reprova "que todo membro acompanha".
       * O que se quer barrar aqui é o motivo que adia a explicação, não a
       * palavra.
       */
      expect(reason, route).not.toMatch(/\b(TODO|FIXME)\b/)
    }
  })
})
