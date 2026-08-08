import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Quem ainda declara `instant = false` — a dívida **P-C2**.
 *
 * # Por que um teste, e não uma linha no PROJECT_PROGRESS
 *
 * `instant = false` desliga a validação de shell estático do segmento e de tudo
 * abaixo dele. É a saída documentada para adoção incremental do
 * `cacheComponents`, e o problema dela não é o custo: é o silêncio. Um segmento
 * novo que nasça com a linha não quebra nada, não aparece em `lint`, não
 * aparece em `typecheck`, e a dívida cresce sem que ninguém decida por ela.
 *
 * Este teste exige a decisão explícita: cada arquivo que desliga a validação
 * está listado abaixo **com o motivo**. Aparecer um a mais, ou some um dos
 * listados, e o teste falha pedindo que a tabela seja atualizada.
 *
 * A lista encolher é a direção certa — e encolher também falha aqui, de
 * propósito: o abandono da linha merece a mesma nota que a adoção dela.
 */

const APP_DIR = join(process.cwd(), 'src', 'app')

/**
 * Motivo de cada opt-out. **Não é documentação decorativa**: sem uma razão que
 * sobreviva à leitura, o certo é converter o segmento, não registrá-lo aqui.
 */
const INSTANT_OPT_OUTS: Record<string, string> = {
  '(app)/layout.tsx':
    'Toda a área autenticada lê sessão antes de decidir o que renderizar; a casca é a leitura.',
  '(auth)/onboarding/page.tsx':
    'A página inteira é uma decisão de sessão que termina em redirect — dentro de <Suspense> o desvio deixaria de ser 307 e passaria a depender de JavaScript.',
  '(auth)/convite/[token]/page.tsx':
    'Mesmo redirect de portão, e aqui ele carrega o token no `next`: sem JS, o convite se perde.',
  '(auth)/recuperar-senha/page.tsx':
    'O único dado dinâmico prefilla o campo que a pessoa digita; qualquer boundary em volta dele remonta o input e apaga o que foi escrito.',
}

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

/** Só a declaração real — a palavra dentro de um comentário não conta. */
const OPT_OUT = /^\s*export\s+const\s+instant\s*=\s*false\s*$/m

function optOutsOnDisk(): string[] {
  return collectFiles(APP_DIR, '.tsx')
    .filter((file) => OPT_OUT.test(readFileSync(file, 'utf8')))
    .map((file) => relative(APP_DIR, file).split(sep).join('/'))
    .sort()
}

describe('P-C2 — opt-outs de shell estático', () => {
  it('nenhum segmento desliga a validação sem estar registrado com motivo', () => {
    expect(optOutsOnDisk()).toEqual(Object.keys(INSTANT_OPT_OUTS).sort())
  })

  it('todo motivo registrado diz algo — não é "TODO"', () => {
    for (const [file, reason] of Object.entries(INSTANT_OPT_OUTS)) {
      expect(reason.length, file).toBeGreaterThan(40)
      expect(reason.toLowerCase(), file).not.toContain('todo')
    }
  })

  it('/login saiu da lista e não pode voltar sem discussão', () => {
    /*
     * A conversão de `/login` é o precedente que o resto da dívida segue: o
     * formulário ficou FORA da fronteira dinâmica e virou o shell; só o aviso de
     * retorno do OAuth entrou no <Suspense>. Se alguém reintroduzir a linha
     * aqui, o formulário deixa de prerenderizar e ninguém percebe.
     */
    expect(optOutsOnDisk()).not.toContain('(auth)/login/page.tsx')
  })
})
