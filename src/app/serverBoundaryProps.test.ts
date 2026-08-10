import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Nenhum Server Component passa FUNCAO como prop.
 *
 * # Por que este teste existe
 *
 * O seletor de paciente da agenda nasceu montado direto na `page.tsx`:
 *
 * ```tsx
 * <AgendaScreen renderPatientField={(control) => <PatientPicker … />} />
 * ```
 *
 * Isso compila, passa no `typecheck`, passa no `lint` e passa no `build` — a
 * rota e dinamica, entao o build nunca a executa. Quebra na primeira
 * renderizacao com sessao, em producao:
 *
 * > Functions cannot be passed directly to Client Components unless you
 * > explicitly expose it by marking it with "use server".
 *
 * Entre um Server Component e um Client Component so atravessa o que o React
 * consegue serializar. Elemento serializa; funcao nao. Um `typecheck` limpo
 * nao diz nada sobre isso, porque a assinatura esta correta dos dois lados — o
 * que esta errado e o LADO DA FRONTEIRA em que a funcao foi criada.
 *
 * A correcao e sempre a mesma: mover a composicao para um arquivo `'use client'`
 * (como `app/(app)/agenda/AgendaWorkspace.tsx`), onde criar funcao e legitimo.
 *
 * # O recorte
 *
 * So arquivos de `src/app` SEM `'use client'`, e so funcao criada na propria
 * prop. `onClick={handleClick}` passando referencia nomeada nao e pego — nem
 * deveria ser, porque a referencia pode ser uma Server Action. O que se pega e
 * a forma que nunca funciona: literal de funcao escrito no JSX de um Server
 * Component.
 */

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

function isClientFile(source: string): boolean {
  return /^\s*['"]use client['"]/m.test(source)
}

/**
 * Literal de funcao aberto imediatamente depois do `=` de uma prop JSX.
 *
 * `algo={() => …}`, `algo={(x) => …}` e `algo={function …}` casam.
 * `algo={items.map((x) => …)}` nao casa: depois de `={` vem `i`, nao `(`.
 */
const INLINE_FUNCTION_PROP =
  /\s[a-zA-Z_$][\w$]*=\{\s*(?:async\s+)?(?:\(\s*[^)]*\)|[a-zA-Z_$][\w$]*)\s*=>|\s[a-zA-Z_$][\w$]*=\{\s*(?:async\s+)?function\b/

describe('fronteira Server -> Client', () => {
  const serverFiles = collectFiles(APP_DIR, '.tsx').filter(
    (file) => !isClientFile(readFileSync(file, 'utf8')),
  )

  it('encontra os Server Components de src/app', () => {
    // Sem isto, um erro no varredor faria a suite passar por lista vazia.
    expect(serverFiles.length).toBeGreaterThan(10)
  })

  it('nenhum Server Component cria funcao dentro de uma prop JSX', () => {
    const offenders = serverFiles
      .filter((file) => INLINE_FUNCTION_PROP.test(readFileSync(file, 'utf8')))
      .map((file) => relative(process.cwd(), file))

    expect(offenders).toEqual([])
  })
})

describe('o proprio varredor', () => {
  it('pega a forma que quebrou a agenda', () => {
    expect(
      INLINE_FUNCTION_PROP.test(
        '<AgendaScreen renderPatientField={(control) => <Picker />} />',
      ),
    ).toBe(true)

    expect(INLINE_FUNCTION_PROP.test('<Botao onClick={() => abrir()} />')).toBe(
      true,
    )

    expect(
      INLINE_FUNCTION_PROP.test('<Lista render={function (x) { return x }} />'),
    ).toBe(true)
  })

  it('nao pega o que e legitimo num Server Component', () => {
    // Referencia nomeada: pode ser Server Action, e atravessa.
    expect(INLINE_FUNCTION_PROP.test('<Form action={salvarAction} />')).toBe(
      false,
    )

    // Dado computado com callback: o resultado e que atravessa, nao a funcao.
    expect(
      INLINE_FUNCTION_PROP.test('<Tela itens={lista.map((x) => x.id)} />'),
    ).toBe(false)

    expect(INLINE_FUNCTION_PROP.test('<Suspense fallback={<Skeleton />} />')).toBe(
      false,
    )
  })
})
