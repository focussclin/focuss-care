import { describe, expect, it } from 'vitest'

import {
  DEFAULT_BUSINESS_HOURS,
  describeBusinessHours,
  type BusinessHours,
} from './business-hours'

/**
 * O expediente em uma frase — a informação que impede a IA de inventar horário.
 *
 * O erro que importa aqui não é uma frase feia: é uma frase que afirma um dia de
 * atendimento que não existe. O paciente aparece, a clínica está fechada.
 */

function dia(
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  opensAt: string,
  closesAt: string,
  closed = false,
) {
  return { weekday, closed, opensAt, closesAt }
}

describe('agrupamento de dias', () => {
  it('dias seguidos com o mesmo horário viram faixa', () => {
    const frase = describeBusinessHours(DEFAULT_BUSINESS_HOURS)

    expect(frase).toContain('segunda a sexta, das 08:00 às 18:00')
    expect(frase).toContain('sábado, das 08:00 às 12:00')
    // Domingo é fechado no padrão: não pode aparecer.
    expect(frase).not.toContain('domingo')
  })

  it('um buraco no meio da semana quebra a faixa', () => {
    /*
     * O caso que a implementação ingênua erra: sem checar a continuidade, a
     * clínica que fecha na quarta apareceria como "segunda a sexta" — e alguém
     * viria na quarta.
     */
    const hours: BusinessHours = [
      dia(1, '08:00', '18:00'),
      dia(2, '08:00', '18:00'),
      dia(3, '08:00', '18:00', true),
      dia(4, '08:00', '18:00'),
      dia(5, '08:00', '18:00'),
      dia(6, '08:00', '12:00', true),
      dia(7, '08:00', '12:00', true),
    ]

    const frase = describeBusinessHours(hours)

    expect(frase).toBe(
      'segunda e terça, das 08:00 às 18:00; quinta e sexta, das 08:00 às 18:00',
    )
  })

  it('horário diferente no meio da semana também quebra a faixa', () => {
    const hours: BusinessHours = [
      dia(1, '08:00', '18:00'),
      dia(2, '08:00', '18:00'),
      dia(3, '10:00', '16:00'),
      dia(4, '08:00', '18:00'),
      dia(5, '08:00', '18:00'),
      dia(6, '08:00', '12:00', true),
      dia(7, '08:00', '12:00', true),
    ]

    expect(describeBusinessHours(hours)).toBe(
      'segunda e terça, das 08:00 às 18:00; quarta, das 10:00 às 16:00; quinta e sexta, das 08:00 às 18:00',
    )
  })

  it('dois dias seguidos usam "e", não "a"', () => {
    // 'segunda a terça' soa como intervalo longo para dois dias.
    const hours: BusinessHours = [
      dia(1, '09:00', '17:00'),
      dia(2, '09:00', '17:00'),
      dia(3, '09:00', '17:00', true),
      dia(4, '09:00', '17:00', true),
      dia(5, '09:00', '17:00', true),
      dia(6, '09:00', '17:00', true),
      dia(7, '09:00', '17:00', true),
    ]

    expect(describeBusinessHours(hours)).toBe('segunda e terça, das 09:00 às 17:00')
  })
})

describe('quando não há o que dizer', () => {
  it('clínica sem nenhum dia aberto devolve null', () => {
    /*
     * `null` faz o assistente responder "vou confirmar com a equipe" em vez de
     * anunciar que a clínica nunca atende — que seria o resultado de uma
     * configuração incompleta, não um fato.
     */
    const fechada: BusinessHours = [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
      dia(weekday as 1, '08:00', '18:00', true),
    )

    expect(describeBusinessHours(fechada)).toBeNull()
  })

  it('um único dia aberto é dito sozinho', () => {
    const hours: BusinessHours = [1, 2, 3, 4, 5, 6, 7].map((weekday) =>
      dia(weekday as 1, '08:00', '12:00', weekday !== 6),
    )

    expect(describeBusinessHours(hours)).toBe('sábado, das 08:00 às 12:00')
  })
})
