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

/*
 * A checagem de "o id vem do `output`, nunca do `input`" vivia aqui, com a
 * lista dos cinco chamadores escrita à mão. Saiu: a varredura de
 * `revalidateTargets.test.ts` passou a fazê-la para QUALQUER helper de rota,
 * descoberto no fonte. Duas listas dos mesmos arquivos envelheceriam em
 * velocidades diferentes, e a que envelhecesse primeiro passaria verde sozinha.
 */
