import { describe, expect, it } from 'vitest'

import { patientListHref } from '@/modules/patients/schemas/patientQuery.schema'

import { patientPaths, patientSearchHref } from './patientRoutes'

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

describe('patientSearchHref', () => {
  it('usa o parâmetro `q`, que é o que a rota lê', () => {
    /*
     * `/pacientes` le `q` — esta em `patientListQuerySchema`. Montar `?search=`
     * produziria uma URL que a rota IGNORA em silencio: a pessoa pediria
     * "Maria" e receberia a base inteira, sem erro nenhum na tela.
     */
    expect(patientSearchHref('Maria')).toBe('/pacientes?q=Maria')
  })

  it('bate exatamente com o link que a própria listagem monta', () => {
    /*
     * A listagem usa `patientListHref` nos filtros e na paginacao. Se os dois
     * divergissem, sair da paleta e clicar em "proxima pagina" perderia o
     * termo — o cursor pertence a UM resultado, e o resultado mudaria.
     */
    for (const term of ['Maria', 'ana paula', 'João']) {
      expect(patientSearchHref(term)).toBe(
        patientListHref({ search: term, status: 'all' }),
      )
    }
  })

  it('codifica o que quebraria a URL', () => {
    expect(patientSearchHref('maria & joão')).toBe(
      '/pacientes?q=maria+%26+jo%C3%A3o',
    )
    // `+` literal precisa virar `%2B`, senao voltaria como espaco.
    expect(patientSearchHref('a+b')).toBe('/pacientes?q=a%2Bb')
    expect(patientSearchHref('50%')).toBe('/pacientes?q=50%25')
    // `#` truncaria a URL no navegador se nao fosse codificado.
    expect(patientSearchHref('a#b')).toBe('/pacientes?q=a%23b')
  })

  it('a ida e a volta preservam o termo', () => {
    // O que importa nao e a forma da codificacao, e o termo chegar inteiro.
    for (const term of ['maria & joão', 'a+b', '50%', 'a#b', 'José']) {
      const href = patientSearchHref(term)
      const parsed = new URLSearchParams(href.split('?')[1])

      expect(parsed.get('q')).toBe(term)
    }
  })

  it('preserva acento, porque a busca do servidor o usa', () => {
    // Normalizar aqui faria a paleta procurar termo diferente do digitado.
    expect(patientSearchHref('José')).toBe('/pacientes?q=Jos%C3%A9')
  })

  it('termo vazio cai na listagem, sem parâmetro pendurado', () => {
    // `?q=` levaria a rota a receber string vazia e sanitiza-la para null — o
    // mesmo resultado, com uma URL que sugere um filtro que nao existe.
    expect(patientSearchHref('')).toBe('/pacientes')
    expect(patientSearchHref('   ')).toBe('/pacientes')
  })
})
