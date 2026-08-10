import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Toda rota privada tem `loading.tsx`.
 *
 * # O que acontece sem ele
 *
 * As rotas de `(app)` fazem de quatro a seis `await` no servidor antes de
 * renderizar. Sem `loading.tsx`, o Next segura a navegação na **tela anterior**
 * até tudo resolver: quem clicou não vê nada acontecer, e clica de novo.
 *
 * Em 10/08/2026 quinze das vinte e sete estavam assim — mais da metade. Nenhuma
 * quebrava, nenhuma dava erro, e é por isso que ficaram: a falha se parece com
 * lentidão, e lentidão não tem dono.
 *
 * # Por que o teste é sobre a EXISTÊNCIA do arquivo
 *
 * Porque é o que o Next exige para transformar espera em resposta. O conteúdo
 * varia — `/dashboard` reproduz a grade real para o layout não pular, o resto
 * usa `PageSkeleton` — e um teste sobre o conteúdo seria um teste sobre gosto.
 */

const APP_DIR = join(process.cwd(), 'src', 'app', '(app)')

/** Diretórios de rota (com `page.tsx`) sob `(app)`, em qualquer profundidade. */
function routeDirs(dir: string): string[] {
  const found: string[] = []

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (!statSync(full).isDirectory()) continue

    if (existsSync(join(full, 'page.tsx'))) found.push(full)
    found.push(...routeDirs(full))
  }

  return found
}

function label(dir: string): string {
  return dir.slice(APP_DIR.length).split(sep).join('/') || '/'
}

describe('estado de carregamento das rotas', () => {
  const dirs = routeDirs(APP_DIR)

  it('encontra as rotas privadas', () => {
    expect(dirs.length).toBeGreaterThan(20)
  })

  it('nenhuma rota privada deixa a navegação sem sinal', () => {
    const semLoading = dirs
      .filter((dir) => !existsSync(join(dir, 'loading.tsx')))
      .map(label)

    expect(semLoading).toEqual([])
  })
})
