import { describe, expect, it } from 'vitest'

import { DEFAULT_PERIOD, parsePeriod, resolvePeriod } from './report.schema'

/**
 * Períodos do relatório (T-01).
 *
 * O erro clássico de relatório é o fim inclusivo: `<= último dia` deixa de fora
 * tudo o que aconteceu depois de 00:00 daquele dia — ou seja, o dia inteiro. É
 * o tipo de defeito que ninguém percebe, porque o número parece plausível.
 */

// 12/08/2026, uma quarta-feira.
const now = new Date(2026, 7, 12, 15, 30)

describe('parsePeriod', () => {
  it('aceita apenas as chaves conhecidas', () => {
    expect(parsePeriod('mes-anterior')).toBe('mes-anterior')
    expect(parsePeriod('ultimos-90-dias')).toBe('ultimos-90-dias')
  })

  it('qualquer outra coisa vira o padrão, sem lançar', () => {
    // Vem da URL: `?periodo=drop-table` nao pode derrubar a pagina.
    expect(parsePeriod('drop-table')).toBe(DEFAULT_PERIOD)
    expect(parsePeriod(undefined)).toBe(DEFAULT_PERIOD)
    expect(parsePeriod(['a', 'b'])).toBe(DEFAULT_PERIOD)
  })
})

describe('resolvePeriod', () => {
  it('este mês vai do dia 1 até o FIM de hoje', () => {
    const period = resolvePeriod('mes-atual', now)

    expect(period.from).toEqual(new Date(2026, 7, 1))
    // Fim exclusivo no dia seguinte: sem isso, tudo o que acontecesse hoje
    // depois da meia-noite ficaria de fora do proprio relatorio de hoje.
    expect(period.to).toEqual(new Date(2026, 7, 13))
  })

  it('este mês NÃO projeta o resto do mês', () => {
    const period = resolvePeriod('mes-atual', now)

    // Ir ate 31/08 contaria agendamentos futuros como se ja tivessem
    // acontecido, e o painel diria que a clinica atendeu mais do que atendeu.
    expect(period.to.getTime()).toBeLessThan(new Date(2026, 8, 1).getTime())
  })

  it('mês passado começa e termina nos limites certos', () => {
    const period = resolvePeriod('mes-anterior', now)

    expect(period.from).toEqual(new Date(2026, 6, 1))
    // 01/08 exclusivo: 31/07 as 23:59 continua dentro.
    expect(period.to).toEqual(new Date(2026, 7, 1))
  })

  it('últimos 90 dias terminam no fim de hoje', () => {
    const period = resolvePeriod('ultimos-90-dias', now)

    expect(period.to).toEqual(new Date(2026, 7, 13))
    expect(
      Math.round(
        (period.to.getTime() - period.from.getTime()) / (24 * 60 * 60 * 1000),
      ),
    ).toBe(90)
  })
})
