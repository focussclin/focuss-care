import { describe, expect, it } from 'vitest'

import { isEmployed, refuseTermination } from './Employee'

/**
 * O período do vínculo — feature **S-03**.
 *
 * `employees.hire_date` e `termination_date` existiam no schema e nenhuma tela
 * as escrevia: o cadastro nascia ativo e **não havia caminho para desligar
 * ninguém**. A lista de funcionários só crescia, e a de ausências oferecia
 * gente que já tinha saído.
 */

const HIRE = new Date('2026-03-01T00:00:00')
const TODAY = new Date('2026-08-11T09:30:00')

describe('está empregado?', () => {
  it('a resposta é a ausência de data de desligamento', () => {
    expect(isEmployed(null)).toBe(true)
    expect(isEmployed(new Date('2026-08-01T00:00:00'))).toBe(false)
  })
})

describe('quando o desligamento é recusado', () => {
  it('data no passado é aceita', () => {
    expect(refuseTermination(HIRE, new Date('2026-08-10T00:00:00'), TODAY))
      .toBeNull()
  })

  it('hoje é aceito — é o caso normal', () => {
    /*
     * O formulário abre com a data de hoje: o desligamento é registrado no dia
     * em que acontece.
     */
    expect(refuseTermination(HIRE, new Date('2026-08-11T00:00:00'), TODAY))
      .toBeNull()
  })

  it('data futura é recusada, e o motivo não é formalismo', () => {
    /*
     * Aviso prévio é rotina, e é justamente o que este produto não pode
     * prometer: sem worker que vire o vínculo no dia marcado, aceitar o futuro
     * tiraria a pessoa da equipe HOJE, enquanto ela ainda trabalha.
     */
    expect(refuseTermination(HIRE, new Date('2026-09-01T00:00:00'), TODAY))
      .toBe('in-future')
  })

  it('data anterior à admissão é recusada', () => {
    // Período negativo: `time_off` pendura ausências neste vínculo, e qualquer
    // contagem de dias trabalhados daria negativo.
    expect(refuseTermination(HIRE, new Date('2026-02-01T00:00:00'), TODAY))
      .toBe('before-hire')
  })

  it('no mesmo dia da admissão é aceito', () => {
    // Contrato encerrado no primeiro dia acontece, e não é dado impossível.
    expect(refuseTermination(HIRE, HIRE, TODAY)).toBeNull()
  })

  it('sem admissão registrada, só a regra do futuro vale', () => {
    /*
     * A base tem cadastros anteriores ao campo. Recusar o desligamento deles
     * por falta de admissão deixaria essas pessoas presas na equipe para
     * sempre.
     */
    expect(refuseTermination(null, new Date('2020-01-01T00:00:00'), TODAY))
      .toBeNull()
    expect(refuseTermination(null, new Date('2026-09-01T00:00:00'), TODAY))
      .toBe('in-future')
  })

  it('o futuro é conferido antes da ordem das datas', () => {
    // Data futura E anterior à admissão: a recusa que a pessoa lê é a que ela
    // consegue corrigir sozinha.
    const hireLater = new Date('2027-01-01T00:00:00')

    expect(refuseTermination(hireLater, new Date('2026-12-01T00:00:00'), TODAY))
      .toBe('in-future')
  })
})
