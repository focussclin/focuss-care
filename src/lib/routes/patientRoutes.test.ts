import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { patientPaths } from './patientRoutes'

/**
 * As rotas de um paciente.
 *
 * Dois riscos, e os dois são silenciosos: `revalidatePath` aceita qualquer
 * string sem reclamar, então um caminho malformado não atualiza a tela e não
 * deixa rastro; e o padrão com segmento dinâmico invalidaria a ficha de todos os
 * pacientes da instalação, o que funciona e custa caro sem ninguém medir.
 */

const PATIENT = '9019956f-bdd8-4d61-868d-09b02332dad0'

describe('patientPaths', () => {
  it('monta a ficha e o histórico a partir do id', () => {
    expect(patientPaths(PATIENT)).toEqual([
      `/pacientes/${PATIENT}`,
      `/pacientes/${PATIENT}/historico`,
    ])
  })

  it('inclui o histórico, que é outra página', () => {
    // `/pacientes/<id>` nao alcanca `/pacientes/<id>/historico`, e as duas
    // telas mostram o nome do paciente e os mesmos atendimentos.
    expect(patientPaths(PATIENT)).toHaveLength(2)
  })

  it('NUNCA usa o padrão com segmento dinâmico', () => {
    /*
     * `revalidatePath('/pacientes/[patientId]', 'page')` invalidaria a ficha de
     * TODOS os pacientes a cada edição de telefone. Numa base de mil pacientes,
     * mil revalidações por escrita.
     */
    for (const path of patientPaths(PATIENT)) {
      expect(path).not.toContain('[')
      expect(path).not.toContain(']')
    }
  })

  it('id vazio NÃO vira revalidação da listagem', () => {
    /*
     * `/pacientes/` invalidaria a LISTAGEM em vez da ficha — revalidação no
     * lugar errado some sem deixar rastro, e é pior que revalidação nenhuma.
     */
    for (const invalid of ['', '   ']) {
      expect(patientPaths(invalid)).toEqual([])
    }
  })

  it('id com barra não inventa uma rota nova', () => {
    // Um id assim so chegaria aqui por defeito a montante, e o caminho montado
    // apontaria para uma rota que nao existe.
    expect(patientPaths('abc/../../admin')).toEqual([])
    expect(patientPaths('a/b')).toEqual([])
  })

  it('preserva o id exatamente como veio do repositório', () => {
    // O id e a chave da linha que a RLS confirmou; qualquer normalizacao aqui
    // desalinharia o caminho da rota real.
    const paths = patientPaths(PATIENT)

    expect(paths[0]).toBe(`/pacientes/${PATIENT}`)
    expect(paths[0].includes(PATIENT.toUpperCase())).toBe(false)
  })
})

describe('quem chama, chama com id validado', () => {
  const ACTIONS = [
    'src/modules/patients/actions/updatePatient.action.ts',
    'src/modules/patients/actions/archivePatient.action.ts',
    'src/modules/scheduling/actions/createAppointment.action.ts',
    'src/modules/scheduling/actions/rescheduleAppointment.action.ts',
    'src/modules/scheduling/actions/cancelAppointment.action.ts',
  ]

  it('o id vem do OUTPUT, nunca da entrada do formulário', () => {
    /*
     * `output` e a linha que o repositorio devolveu, depois da RLS. `input` e o
     * que o navegador mandou. Montar a URL a partir do segundo deixaria o
     * cliente escolher qual rota expirar — o mesmo motivo pelo qual `cacheTags`
     * nao recebe `input`.
     */
    for (const file of ACTIONS) {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      const calls = [...source.matchAll(/patientPaths\(([^)]*)\)/g)].map(
        (match) => match[1].trim(),
      )

      expect(calls.length).toBeGreaterThan(0)

      for (const argument of calls) {
        expect(argument.startsWith('output.')).toBe(true)
        expect(argument).not.toContain('input')
      }
    }
  })
})
