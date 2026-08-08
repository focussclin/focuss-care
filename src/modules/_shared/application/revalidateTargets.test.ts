import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Varredura das Server Actions: os caminhos que elas revalidam existem?
 *
 * Este arquivo lê o CÓDIGO-FONTE, o que é incomum, e a razão é específica:
 * `revalidatePath` aceita qualquer string e não reclama de rota inexistente. Um
 * `/financiero` com typo não quebra teste nenhum, não aparece em log, e a tela
 * simplesmente não atualiza — o defeito só é notado quando alguém jura que
 * salvou e o número continua velho.
 *
 * A segunda regra guarda um erro que já aconteceu: `revalidatePath('/')` sem
 * `type` invalida apenas a página raiz, não a casca compartilhada. Quem escreve
 * `'/'` numa action quase sempre queria o layout — o nome no topo da tela.
 */

const MODULES_DIR = join(process.cwd(), 'src', 'modules')
const APP_DIR = join(process.cwd(), 'src', 'app')

function collectFiles(dir: string, suffix: string): string[] {
  const found: string[] = []

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)

    if (statSync(full).isDirectory()) {
      found.push(...collectFiles(full, suffix))
    } else if (entry.endsWith(suffix)) {
      found.push(full)
    }
  }

  return found
}

/** Rotas que existem em `src/app`, derivadas dos arquivos `page.tsx`. */
function existingRoutes(): Set<string> {
  const routes = new Set<string>(['/'])

  for (const file of collectFiles(APP_DIR, 'page.tsx')) {
    const relative = file
      .slice(APP_DIR.length)
      .replace(/\\/g, '/')
      .replace(/\/page\.tsx$/, '')
      // Grupos de rota — `(app)`, `(auth)` — não aparecem na URL.
      .replace(/\/\([^)]+\)/g, '')

    routes.add(relative === '' ? '/' : relative)
  }

  return routes
}

interface ActionRevalidation {
  file: string
  /** Strings simples de `revalidatePaths`. */
  paths: string[]
  /** Entradas com `type` explícito. */
  typed: { path: string; type: string }[]
}

function readRevalidations(): ActionRevalidation[] {
  return collectFiles(MODULES_DIR, '.action.ts')
    .filter((file) => !file.endsWith('.test.ts'))
    .map((file) => {
      const source = readFileSync(file, 'utf8')
      const paths: string[] = []
      const typed: { path: string; type: string }[] = []

      // Cada bloco `revalidatePaths: [...]` do arquivo.
      for (const block of source.matchAll(/revalidatePaths:\s*\[([\s\S]*?)\]/g)) {
        const body = block[1]

        for (const entry of body.matchAll(
          /\{\s*path:\s*'([^']+)',\s*type:\s*'([^']+)'\s*\}/g,
        )) {
          typed.push({ path: entry[1], type: entry[2] })
        }

        // Strings soltas — descontadas as que já vieram no formato objeto.
        const withoutObjects = body.replace(
          /\{\s*path:\s*'[^']+',\s*type:\s*'[^']+'\s*\}/g,
          '',
        )

        for (const entry of withoutObjects.matchAll(/'([^']+)'/g)) {
          paths.push(entry[1])
        }
      }

      return { file: file.slice(process.cwd().length + 1), paths, typed }
    })
    .filter((entry) => entry.paths.length > 0 || entry.typed.length > 0)
}

const revalidations = readRevalidations()
const routes = existingRoutes()

describe('varredura das Server Actions', () => {
  it('encontra as actions do produto', () => {
    // Guarda contra o pior modo de falha deste arquivo: a leitura parar de
    // achar os arquivos e todos os testes abaixo passarem sobre lista vazia.
    expect(revalidations.length).toBeGreaterThanOrEqual(15)
  })

  it('todo caminho revalidado existe em src/app', () => {
    const broken = revalidations.flatMap((entry) =>
      [...entry.paths, ...entry.typed.map((item) => item.path)]
        .filter((path) => !routes.has(path))
        .map((path) => `${entry.file} -> ${path}`),
    )

    // Caminho inexistente nao lanca: a tela so nao atualiza, e ninguem sabe.
    expect(broken).toEqual([])
  })

  it('a raiz só é revalidada com type: layout', () => {
    const bare = revalidations
      .filter((entry) => entry.paths.includes('/'))
      .map((entry) => entry.file)

    /*
     * `revalidatePath('/')` invalida a PAGINA raiz. Quem escreve isso numa
     * action quase sempre queria a casca — o nome da clinica e o do usuario
     * aparecem no topo de toda rota autenticada, e ficariam velhos ali.
     */
    expect(bare).toEqual([])
  })

  it('as duas actions de identidade revalidam a casca inteira', () => {
    const layoutTargets = revalidations.filter((entry) =>
      entry.typed.some((item) => item.path === '/' && item.type === 'layout'),
    )

    const files = layoutTargets.map((entry) => entry.file.replace(/\\/g, '/'))

    expect(files).toContain(
      'src/modules/identity/actions/updateProfile.action.ts',
    )
    expect(files).toContain(
      'src/modules/settings/actions/updateClinicProfile.action.ts',
    )
  })

  it('nenhuma action revalida uma rota que ela não alimenta', () => {
    /*
     * Mapa deliberadamente escrito à mão, e por módulo: é a afirmação de quais
     * telas leem o dado que cada módulo escreve. Uma action que revalidasse
     * `/prontuarios` ao mexer em convênio nao quebraria nada visivelmente — so
     * jogaria fora cache alheio a cada escrita.
     */
    const allowedByModule: Record<string, readonly string[]> = {
      billing: ['/financeiro'],
      encounters: ['/atendimentos', '/dashboard'],
      identity: ['/'],
      insurance: ['/convenios'],
      patients: ['/pacientes', '/dashboard', '/relatorios'],
      records: ['/prontuarios'],
      scheduling: ['/agenda', '/dashboard', '/relatorios'],
      settings: ['/', '/configuracoes', '/agenda'],
      team: ['/equipe'],
    }

    const violations = revalidations.flatMap((entry) => {
      const normalized = entry.file.replace(/\\/g, '/')
      const moduleName = normalized.split('/')[2]
      const allowed = allowedByModule[moduleName] ?? []

      return [...entry.paths, ...entry.typed.map((item) => item.path)]
        .filter((path) => !allowed.includes(path))
        .map((path) => `${normalized} -> ${path}`)
    })

    expect(violations).toEqual([])
  })
})
