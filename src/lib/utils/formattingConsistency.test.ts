import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Data e dinheiro têm UM formato no produto inteiro.
 *
 * # O que este guard impede
 *
 * `lib/utils/date.ts` e `lib/utils/money.ts` existem para isso, e mesmo assim
 * cinco telas tinham formatação própria em 12/08/2026: a conversa do inbox
 * mostrava "12/08/2026, 14:30:07" (com segundos) enquanto a auditoria ao lado
 * mostrava "12/08 às 14:30"; o CRM escrevia o ano e o resto do produto não; o
 * valor do lead usava um `Intl.NumberFormat` próprio, idêntico ao de `money.ts`.
 *
 * Nada disso quebra teste, build ou lint. É o tipo de divergência que só aparece
 * quando alguém coloca duas telas lado a lado — e que se multiplica porque cada
 * tela nova copia a vizinha.
 *
 * # O que continua permitido
 *
 * `toLocaleString` sobre NÚMERO (contadores, medidas) não é alvo: não há helper
 * central para isso e o formato não varia entre telas. O que é proibido é
 * formatar **data** à mão — para isso existem doze funções em `date.ts`.
 */

const MODULES = join(process.cwd(), 'src', 'modules')

/**
 * Formatação de data feita à mão.
 *
 * `toLocaleDateString` e `toLocaleTimeString` só existem para data; qualquer uso
 * é divergência. `toLocale*` encostado num `new Date(...)` é o mesmo caso escrito
 * de outro jeito.
 */
const PROIBIDOS: { padrao: RegExp; motivo: string }[] = [
  {
    padrao: /\.toLocaleDateString\(/,
    motivo: 'use formatShortDate/formatFullDate de @/lib/utils/date',
  },
  {
    padrao: /\.toLocaleTimeString\(/,
    motivo: 'use formatTime de @/lib/utils/date',
  },
  {
    padrao: /new Date\([^)]*\)\s*\.toLocaleString\(/,
    motivo: 'use formatShortDate + formatTime de @/lib/utils/date',
  },
  {
    padrao: /style:\s*'currency'/,
    motivo: 'use formatCents de @/lib/utils/money',
  },
]

/**
 * Exceções — cada uma com motivo que sobreviva à leitura.
 *
 * Vazia hoje, e o formato existe para que a primeira exceção precise ser
 * justificada por escrito em vez de aparecer sozinha num diff.
 */
const EXCECOES: Record<string, string> = {}

function arquivos(dir: string): string[] {
  const encontrados: string[] = []

  for (const entrada of readdirSync(dir)) {
    const completo = join(dir, entrada)

    if (statSync(completo).isDirectory()) {
      encontrados.push(...arquivos(completo))
    } else if (/\.tsx?$/.test(entrada) && !/\.test\./.test(entrada)) {
      encontrados.push(completo)
    }
  }

  return encontrados
}

describe('data e dinheiro têm um formato só', () => {
  const violacoes = arquivos(MODULES).flatMap((arquivo) => {
    const caminho = relative(process.cwd(), arquivo).split(sep).join('/')
    if (caminho in EXCECOES) return []

    const fonte = readFileSync(arquivo, 'utf8')

    return PROIBIDOS.filter(({ padrao }) => padrao.test(fonte)).map(
      ({ motivo }) => `${caminho}: ${motivo}`,
    )
  })

  it('nenhum módulo formata data por conta própria', () => {
    expect(violacoes).toEqual([])
  })

  it('o varredor está olhando para os arquivos certos', () => {
    // Sem isto, um erro no caminho faria a suíte passar por lista vazia.
    expect(arquivos(MODULES).length).toBeGreaterThan(100)
  })

  it('toda exceção registrada diz por quê', () => {
    for (const [caminho, motivo] of Object.entries(EXCECOES)) {
      expect(motivo.length, caminho).toBeGreaterThan(40)
    }
  })
})
