import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { preferredNameOfRow, preferredPatientName } from './preferred-name'

/**
 * O nome social valendo em TODA tela — feature **P-NS**.
 *
 * A regra existia desde a fatia de identificação e só alcançava a ficha e a
 * listagem de pacientes. Nas outras nove telas a pessoa aparecia pelo nome de
 * registro — inclusive na sala de espera, que é onde o dano acontece.
 */

describe('a regra', () => {
  it('o social vence quando existe', () => {
    expect(
      preferredPatientName({ fullName: 'João da Silva', socialName: 'Joana' }),
    ).toBe('Joana')
  })

  it('sem social, usa o de registro', () => {
    expect(
      preferredPatientName({ fullName: 'João da Silva', socialName: null }),
    ).toBe('João da Silva')
  })

  it('social só com espaço não conta', () => {
    // `'   '` passaria por um `??` ingênuo e o paciente ficaria SEM nome.
    expect(
      preferredPatientName({ fullName: 'João da Silva', socialName: '   ' }),
    ).toBe('João da Silva')
  })

  it('campo ausente é o mesmo que nulo', () => {
    // Linha vinda de um select que ainda não pede a coluna.
    expect(preferredPatientName({ fullName: 'Ana' })).toBe('Ana')
  })
})

describe('o atalho para a linha do banco', () => {
  it('lê a forma crua', () => {
    expect(
      preferredNameOfRow({ full_name: 'João da Silva', social_name: 'Joana' }),
    ).toBe('Joana')
  })

  it('linha ausente devolve o rótulo padrão', () => {
    // Join que não trouxe o paciente — o registro continua legível.
    expect(preferredNameOfRow(null)).toBe('Paciente')
    expect(preferredNameOfRow(undefined)).toBe('Paciente')
  })

  it('o rótulo padrão é escolhido por quem chama', () => {
    /*
     * Cada tela tem o seu: "Paciente" na agenda, "Paciente não localizado" nos
     * documentos. Fixá-lo aqui apagaria essa diferença.
     */
    expect(preferredNameOfRow(null, 'Paciente não localizado')).toBe(
      'Paciente não localizado',
    )
  })
})

/**
 * A varredura que impede o décimo módulo de esquecer.
 *
 * Este arquivo lê o CÓDIGO-FONTE, o que é incomum, e a razão é a mesma de
 * `revalidateTargets.test.ts`: um `patients ( full_name )` sem `social_name`
 * **não quebra nada**. A consulta funciona, a tela mostra um nome, e o defeito é
 * chamar alguém pelo nome errado — que nenhum teste de unidade vê e nenhum
 * usuário reporta como bug do sistema.
 */
const MODULES_DIR = join(process.cwd(), 'src', 'modules')

function sourceFiles(dir: string): string[] {
  const found: string[] = []

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path))
      continue
    }
    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) found.push(path)
  }

  return found
}

/**
 * Um embed de `patients` que pede `full_name`.
 *
 * Casa `patients ( full_name )`, `patients ( id, full_name )` e a forma com
 * `!fk`. Não casa `.select('full_name')` solto, que é leitura de uma coluna e
 * não de um join — `readPatientName` do financeiro faz isso de propósito.
 */
const PATIENT_EMBED = /patients[^()\n]*\(\s*([^)]*\bfull_name\b[^)]*)\)/g

describe('todo módulo que exibe nome de paciente pede o social', () => {
  const offenders: string[] = []

  for (const file of sourceFiles(MODULES_DIR)) {
    const source = readFileSync(file, 'utf8')

    for (const match of source.matchAll(PATIENT_EMBED)) {
      if (!match[1].includes('social_name')) {
        offenders.push(`${file.slice(process.cwd().length + 1)} -> ${match[0]}`)
      }
    }
  }

  it('encontra os embeds do produto', () => {
    // Sem isto, um erro no varredor faria o caso abaixo passar sobre lista
    // vazia — e a regressão voltaria em silêncio.
    const total = sourceFiles(MODULES_DIR)
      .map((file) => [...readFileSync(file, 'utf8').matchAll(PATIENT_EMBED)].length)
      .reduce((sum, count) => sum + count, 0)

    expect(total).toBeGreaterThanOrEqual(9)
  })

  it('nenhum embed lê só o nome de registro', () => {
    expect(offenders).toEqual([])
  })
})

describe('nenhum módulo lê o nome cru do embed', () => {
  it('a exibição passa pela regra', () => {
    /*
     * Pedir `social_name` no select e depois usar `row.patients.full_name` seria
     * o mesmo defeito com uma coluna a mais no tráfego.
     */
    const offenders = sourceFiles(MODULES_DIR)
      .filter((file) => !file.includes('patients'))
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8')
        return [
          ...source.matchAll(/row\.(?:\w+\?\.)*patients?\?\.full_name/g),
        ].map((match) => `${file.slice(process.cwd().length + 1)} -> ${match[0]}`)
      })

    expect(offenders).toEqual([])
  })
})
