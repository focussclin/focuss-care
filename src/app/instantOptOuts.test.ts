import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Cache Components nao e usado no runtime Cloudflare workerd. Este teste
 * impede que um segmento volte a declarar `instant = false` sem uma decisao
 * explicita e uma estrategia de runtime compativel.
 */
const APP_DIR = join(process.cwd(), 'src', 'app')
const OPT_OUT = /^\s*export\s+const\s+instant\s*=\s*false\s*$/m

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

function optOutsOnDisk(): string[] {
  return collectFiles(APP_DIR, '.tsx')
    .filter((file) => OPT_OUT.test(readFileSync(file, 'utf8')))
    .map((file) => relative(APP_DIR, file).split(sep).join('/'))
    .sort()
}

describe('P-C2 — opt-outs de shell estatico', () => {
  it('nenhum segmento desliga a validacao no runtime Cloudflare', () => {
    expect(optOutsOnDisk()).toEqual([])
  })

  it.each([
    ['(auth)/recuperar-senha/page.tsx'],
    ['(auth)/redefinir-senha/page.tsx'],
  ])('%s nao usa opt-out de shell', (route) => {
    expect(optOutsOnDisk()).not.toContain(route)
  })
})
