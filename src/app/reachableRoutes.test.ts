import { readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

import { navItems } from '@/components/layout/navigation'

/**
 * Toda rota construída é alcançável — ou está registrada como escondida.
 *
 * # O estado que este teste inventou nome para
 *
 * `navigation.test.ts` já cobre um sentido: item habilitado do menu tem que
 * apontar para rota que existe, senão é 404 esperando alguém clicar.
 *
 * O sentido inverso não tinha guarda, e ele apareceu de verdade em 09/08/2026:
 * `/salas-e-recursos` foi construída inteira — domínio, adapter, action, tela e
 * teste — e o item do menu continua `disabled`, porque a migration
 * `20260809_rooms.sql` não foi aplicada. A decisão é certa: prometer
 * persistência numa relação que não existe seria pior. Mas o resultado é uma
 * feature pronta que **ninguém alcança**, e nada avisaria se ela ficasse assim.
 *
 * Feature escondida não dá erro, não quebra teste e não aparece em lugar
 * nenhum — some no repositório até alguém lembrar. Registrá-la aqui obriga a
 * lembrança a ser explícita: com motivo, e com uma linha que sai no dia em que
 * o item for habilitado.
 */

const APP_DIR = join(process.cwd(), 'src', 'app')

/**
 * Rotas prontas que o menu ainda não oferece, e o porquê de cada uma.
 *
 * **Cada entrada é uma dívida com prazo**: some daqui quando o item do menu for
 * habilitado. Entrada sem motivo que sobreviva à leitura é sinal de que a
 * feature devia ser exposta ou removida, não registrada.
 */
const BUILT_BUT_HIDDEN: Record<string, string> = {
  '/crm':
    'Depende de `supabase/migrations/20260809_clinic_leads.sql`, escrita e revisada mas não aplicada. A tela declara a pendência e mantém o item bloqueado até a persistência do pipeline existir.',
  '/inbox':
    'A leitura usa conversations e messages reais, mas a ingestão e o envio dependem do provedor de WhatsApp/worker ainda não configurado. O item permanece bloqueado para não prometer uma caixa de entrada operacional incompleta.',
  '/salas-e-recursos':
    'Depende de `supabase/migrations/20260809_rooms.sql`, escrita e revisada mas não aplicada. Com a tabela ausente a tela mostra o estado pendente; habilitar o item prometeria persistência que o banco não sustenta.',
  '/tarefas':
    'Depende de `supabase/migrations/20260809_clinic_tasks.sql`, escrita e revisada mas não aplicada. Mesmo motivo de `/salas-e-recursos`: a tela declara a pendência em vez de prometer que a tarefa fica salva.',
}

/**
 * Rotas que legitimamente não são item de menu.
 *
 * Não é a mesma coisa que estar escondida: nenhuma delas caberia num menu de
 * navegação lateral.
 */
const NOT_MENU_ROUTES = new Set([
  // Fluxo de autenticação — quem está nelas ainda não vê o menu.
  '/',
  '/login',
  '/cadastro',
  '/recuperar-senha',
  '/redefinir-senha',
  '/onboarding',
  '/convite/[token]',
  // Subrota alcançada a partir da ficha do paciente, não do menu.
  '/pacientes/[patientId]',
  '/pacientes/[patientId]/historico',
])

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

/** Rotas reais, derivadas dos `page.tsx` — grupos `(app)` não entram na URL. */
function existingRoutes(): string[] {
  return collectFiles(APP_DIR, 'page.tsx')
    .map((file) => {
      const relative = file
        .slice(APP_DIR.length)
        .split(sep)
        .join('/')
        .replace(/\/page\.tsx$/, '')
        .replace(/\/\([^/]+\)/g, '')

      return relative === '' ? '/' : relative
    })
    .sort()
}

const enabledHrefs = new Set(
  navItems.filter((item) => !item.disabled).map((item) => item.href),
)

describe('rotas alcançáveis', () => {
  const routes = existingRoutes()

  it('encontra as rotas do app', () => {
    // Sem isto, um erro no varredor faria a suíte passar por lista vazia.
    expect(routes.length).toBeGreaterThan(15)
  })

  it('toda rota é alcançável, dispensada do menu, ou registrada como escondida', () => {
    const orfas = routes.filter(
      (route) =>
        !enabledHrefs.has(route) &&
        !NOT_MENU_ROUTES.has(route) &&
        !(route in BUILT_BUT_HIDDEN),
    )

    expect(orfas).toEqual([])
  })

  it('nada registrado como escondido já está no menu', () => {
    /*
     * O dia em que o item for habilitado, esta linha falha e obriga a remover a
     * entrada — que é como a dívida se fecha em vez de virar comentário velho.
     */
    const jaVisiveis = Object.keys(BUILT_BUT_HIDDEN).filter((route) =>
      enabledHrefs.has(route),
    )

    expect(jaVisiveis).toEqual([])
  })

  it('nada registrado como escondido deixou de existir', () => {
    const sumiram = Object.keys(BUILT_BUT_HIDDEN).filter(
      (route) => !routes.includes(route),
    )

    expect(sumiram).toEqual([])
  })

  it('todo motivo registrado diz alguma coisa', () => {
    for (const [route, reason] of Object.entries(BUILT_BUT_HIDDEN)) {
      expect(reason.length, route).toBeGreaterThan(60)
      expect(reason.toLowerCase(), route).not.toContain('todo')
    }
  })
})

describe('itens desabilitados do menu', () => {
  it('nenhum item desabilitado aponta para rota que já existe', () => {
    /*
     * Item apagado sobre rota pronta é a contradição que originou este arquivo:
     * a tela funciona e o menu diz que não. Aceito enquanto estiver em
     * `BUILT_BUT_HIDDEN` com motivo — fora dali, é esquecimento.
     */
    const routes = new Set(existingRoutes())

    const contraditorios = navItems
      .filter((item) => item.disabled)
      .filter((item) => routes.has(item.href))
      .map((item) => item.href)
      .filter((href) => !(href in BUILT_BUT_HIDDEN))

    expect(contraditorios).toEqual([])
  })
})
