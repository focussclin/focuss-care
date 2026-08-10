import { describe, expect, it } from 'vitest'

import {
  activeAllergies,
  findSameSubstance,
  normalizeSubstance,
  sortForChart,
  type Allergy,
} from './Allergy'

function allergy(patch: Partial<Allergy>): Allergy {
  return {
    id: 'a1',
    patientId: 'p1',
    substance: 'Dipirona',
    reaction: null,
    isActive: true,
    recordedBy: null,
    recordedAt: new Date('2026-08-01T10:00:00.000Z'),
    ...patch,
  }
}

/**
 * Duas entradas para a mesma substância não são duplicata boba — são risco.
 *
 * "Dipirona — urticária" e "dipirona — choque anafilático" na mesma ficha
 * deixam quem lê sem saber qual vale, e a leitura apressada pega a primeira.
 */
describe('substância repetida', () => {
  it('ignora caixa e espaço, que é como a digitação varia', () => {
    const existing = [allergy({ substance: 'Dipirona' })]

    expect(findSameSubstance(existing, 'dipirona')).toBeTruthy()
    expect(findSameSubstance(existing, '  DIPIRONA  ')).toBeTruthy()
    expect(findSameSubstance(existing, 'Dipirona')).toBeTruthy()
  })

  it('colapsa espaço interno', () => {
    const existing = [allergy({ substance: 'ácido acetilsalicílico' })]

    expect(findSameSubstance(existing, 'ácido   acetilsalicílico')).toBeTruthy()
  })

  it('não confunde substâncias diferentes', () => {
    const existing = [allergy({ substance: 'Dipirona' })]

    expect(findSameSubstance(existing, 'Dipirona sódica')).toBeNull()
    expect(findSameSubstance(existing, 'Penicilina')).toBeNull()
  })

  it('acha também entre as descartadas', () => {
    /*
     * Registrar de novo uma substância descartada tem de esbarrar na entrada
     * existente: o certo é reativá-la, preservando quem registrou e quando.
     */
    const existing = [allergy({ substance: 'Látex', isActive: false })]

    expect(findSameSubstance(existing, 'látex')).toBeTruthy()
  })

  it('lista vazia não acha nada', () => {
    expect(findSameSubstance([], 'Dipirona')).toBeNull()
  })

  it('a normalização não altera o que é gravado', () => {
    // Ela serve para COMPARAR. O texto exibido continua sendo o que a pessoa
    // digitou — "Dipirona" com maiúscula é como o profissional escreveu.
    expect(normalizeSubstance('  Dipirona  ')).toBe('dipirona')
  })
})

describe('ordem na ficha', () => {
  it('ativas primeiro, e as mais recentes no topo', () => {
    const ordered = sortForChart([
      allergy({ id: 'velha-ativa', recordedAt: new Date('2026-01-01T10:00:00.000Z') }),
      allergy({ id: 'descartada', isActive: false, recordedAt: new Date('2026-08-09T10:00:00.000Z') }),
      allergy({ id: 'nova-ativa', recordedAt: new Date('2026-08-01T10:00:00.000Z') }),
    ])

    expect(ordered.map((entry) => entry.id)).toEqual(['nova-ativa', 'velha-ativa', 'descartada'])
  })

  it('funciona com a data em ISO, que é como o DTO viaja', () => {
    /*
     * A regra é a mesma no domínio e na tela. Especializar em `Date` obrigaria
     * o painel a converter cada item só para ordenar — conversão que existe
     * para satisfazer o tipo e some com um `cast` na primeira pressa.
     */
    const ordered = sortForChart([
      { isActive: false, recordedAt: '2026-08-09T10:00:00.000Z', id: 'x' },
      { isActive: true, recordedAt: '2026-01-01T10:00:00.000Z', id: 'y' },
    ])

    expect(ordered.map((entry) => entry.id)).toEqual(['y', 'x'])
  })

  it('não muda a lista recebida', () => {
    const original = [
      allergy({ id: 'a', isActive: false }),
      allergy({ id: 'b', isActive: true }),
    ]

    sortForChart(original)

    expect(original.map((entry) => entry.id)).toEqual(['a', 'b'])
  })
})

describe('alergias ativas', () => {
  it('conta só o que está em vigor', () => {
    const list = [
      allergy({ id: 'a' }),
      allergy({ id: 'b', isActive: false }),
      allergy({ id: 'c' }),
    ]

    expect(activeAllergies(list).map((entry) => entry.id)).toEqual(['a', 'c'])
  })
})
