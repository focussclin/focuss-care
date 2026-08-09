import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * O que as portas públicas dos módulos podem expor.
 *
 * # O buraco que este arquivo fecha
 *
 * `src/modules/<módulo>/index.ts` existe para que um módulo vizinho reutilize
 * uma peça sem conhecer a organização interna do outro — hoje, `insurance/ui`
 * importa `PatientPicker` de `@/modules/patients`.
 *
 * O risco é o barril virar a porta dos fundos da **regra 4**: basta alguém
 * acrescentar `export * from './domain/Patient'` para que a entidade de um
 * módulo passe a circular pelos outros, e nada reclama. O `eslint.config.mjs`
 * registra a categoria `public-api`, mas **nenhuma policy a usa** — a
 * classificação existe e não restringe nada.
 *
 * As duas defesas que existem não alcançam esse caso: o lint proíbe alcançar
 * OUTRO módulo daqui, e `infrastructure` é `server-only`, o que quebraria o
 * build de quem importasse do cliente. Sobram `domain`, `actions`, `application`
 * e `schemas` do próprio módulo, e é exatamente aí que este teste entra.
 *
 * # O recorte
 *
 * `ui` e `schemas` podem ser reexportados: componente e tipo/contrato são o que
 * um vizinho legitimamente reaproveita. `domain`, `application`, `actions` e
 * `infrastructure` não — os três primeiros são o miolo do módulo, e o quarto
 * fala com o banco.
 */

const MODULES_DIR = join(process.cwd(), 'src', 'modules')

/** Camadas que a porta pública pode reexportar. */
const EXPORTABLE = ['ui', 'schemas'] as const

/** O que reexportar daqui reabriria a regra 4. */
const FORBIDDEN = ['domain', 'application', 'actions', 'infrastructure'] as const

function publicApiFiles(): string[] {
  return readdirSync(MODULES_DIR)
    .map((entry) => join(MODULES_DIR, entry))
    .filter((full) => statSync(full).isDirectory())
    .map((full) => join(full, 'index.ts'))
    .filter((file) => {
      try {
        return statSync(file).isFile()
      } catch {
        return false
      }
    })
}

/** De onde cada `export … from '…'` do arquivo puxa. */
function reexportSources(file: string): string[] {
  const source = readFileSync(file, 'utf8')

  return [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
    (match) => match[1],
  )
}

function layerOf(specifier: string): string | null {
  const match = /^\.\/([^/]+)\//.exec(specifier)
  return match ? match[1] : null
}

describe('portas públicas dos módulos', () => {
  const files = publicApiFiles()

  it('há pelo menos uma porta pública para verificar', () => {
    // Sem isto, apagar todos os barris faria a suíte passar por lista vazia.
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(FORBIDDEN)('nenhuma porta reexporta %s', (layer) => {
    const offenders = files
      .filter((file) =>
        reexportSources(file).some((source) => layerOf(source) === layer),
      )
      .map((file) => relative(process.cwd(), file).split(sep).join('/'))

    expect(offenders).toEqual([])
  })

  it('toda reexportação sai de uma camada permitida', () => {
    const offenders: string[] = []

    for (const file of files) {
      for (const source of reexportSources(file)) {
        const layer = layerOf(source)

        // Caminho que não é `./<camada>/…` — inclui alias `@/…`, que o lint já
        // proíbe aqui, e reexportação de arquivo solto na raiz do módulo.
        if (layer === null || !EXPORTABLE.includes(layer as never)) {
          offenders.push(
            `${relative(process.cwd(), file).split(sep).join('/')} -> ${source}`,
          )
        }
      }
    }

    expect(offenders).toEqual([])
  })
})

describe('o próprio varredor', () => {
  it('reconhece a camada de um caminho relativo', () => {
    expect(layerOf('./ui/PatientPicker')).toBe('ui')
    expect(layerOf('./domain/Patient')).toBe('domain')
  })

  it('devolve null para o que não é `./<camada>/…`', () => {
    expect(layerOf('@/modules/scheduling')).toBeNull()
    expect(layerOf('./Patient')).toBeNull()
  })
})
