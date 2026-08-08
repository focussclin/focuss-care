import { describe, expect, it } from 'vitest'

import {
  DEFAULT_BUSINESS_HOURS,
  businessHoursToJson,
  findOutsideBusinessHours,
  isoWeekdayOf,
  parseStoredBusinessHours,
  type BusinessHours,
} from './business-hours'

/**
 * O contrato do horário de funcionamento (C-01 escreve, A-02 verifica).
 *
 * As bordas testadas aqui são as que decidem se uma clínica consegue trabalhar:
 * atendimento que termina EXATAMENTE na hora de fechar precisa caber, e
 * configuração ausente não pode virar recusa.
 */

/** Seg–sex 08:00–18:00, sábado 08:00–12:00, domingo fechado. */
const week: BusinessHours = [
  { weekday: 1, closed: false, opensAt: '08:00', closesAt: '18:00' },
  { weekday: 2, closed: false, opensAt: '08:00', closesAt: '18:00' },
  { weekday: 3, closed: false, opensAt: '08:00', closesAt: '18:00' },
  { weekday: 4, closed: false, opensAt: '08:00', closesAt: '18:00' },
  { weekday: 5, closed: false, opensAt: '08:00', closesAt: '18:00' },
  { weekday: 6, closed: false, opensAt: '08:00', closesAt: '12:00' },
  { weekday: 7, closed: true, opensAt: '08:00', closesAt: '12:00' },
]

// 10/08/2026 é segunda-feira; 15/08 é sábado; 16/08 é domingo.
const monday = (hours: number, minutes = 0) =>
  new Date(2026, 7, 10, hours, minutes)

describe('isoWeekdayOf', () => {
  it('põe o domingo no fim da semana, e não no começo', () => {
    // `Date.getDay()` devolve 0 para domingo; o formato guardado usa 1–7. Errar
    // esta conversão desloca a semana inteira em um dia.
    expect(isoWeekdayOf(new Date(2026, 7, 10))).toBe(1)
    expect(isoWeekdayOf(new Date(2026, 7, 15))).toBe(6)
    expect(isoWeekdayOf(new Date(2026, 7, 16))).toBe(7)
  })
})

describe('findOutsideBusinessHours', () => {
  it('aceita o intervalo dentro do expediente', () => {
    expect(
      findOutsideBusinessHours(week, monday(9), monday(9, 30)),
    ).toBeNull()
  })

  it('aceita o atendimento que termina EXATAMENTE no fechamento', () => {
    // Quem fecha às 18h atende até as 18h. Recusar aqui tiraria o último
    // horário do dia de toda clínica.
    expect(
      findOutsideBusinessHours(week, monday(17, 30), monday(18)),
    ).toBeNull()
  })

  it('recusa o que começa antes de abrir', () => {
    expect(
      findOutsideBusinessHours(week, monday(7, 30), monday(8, 30)),
    ).toMatchObject({ reason: 'before-opening', weekday: 1 })
  })

  it('recusa o que termina depois de fechar', () => {
    expect(
      findOutsideBusinessHours(week, monday(17, 45), monday(18, 15)),
    ).toMatchObject({ reason: 'after-closing' })
  })

  it('recusa dia fechado', () => {
    expect(
      findOutsideBusinessHours(
        week,
        new Date(2026, 7, 16, 10),
        new Date(2026, 7, 16, 10, 30),
      ),
    ).toMatchObject({ reason: 'closed', weekday: 7 })
  })

  it('recusa atendimento que atravessa a meia-noite', () => {
    // O dia seguinte tem outro expediente: comparar o fim com o horário de
    // ontem daria "cabe" para uma consulta das 23:30 às 00:30.
    expect(
      findOutsideBusinessHours(week, monday(23, 30), new Date(2026, 7, 11, 0, 30)),
    ).toMatchObject({ reason: 'after-closing' })
  })

  it('semana incompleta LIBERA em vez de inventar regra', () => {
    const incomplete = week.filter((day) => day.weekday !== 1)

    expect(
      findOutsideBusinessHours(incomplete, monday(23), monday(23, 30)),
    ).toBeNull()
  })
})

describe('parseStoredBusinessHours', () => {
  it('coluna vazia é ausência de configuração, não formato errado', () => {
    expect(parseStoredBusinessHours({}).source).toBe('default')
    expect(parseStoredBusinessHours(null).source).toBe('default')
    expect(parseStoredBusinessHours([]).source).toBe('default')
  })

  it('formato desconhecido é sinalizado, e não confundido com vazio', () => {
    // A agenda só impõe `stored`, então esta distinção decide se uma clínica
    // com dado estranho fica sem conseguir agendar.
    expect(parseStoredBusinessHours({ seg: '8h' }).source).toBe('unrecognized')
  })

  it('vai e volta pelo mesmo contrato', () => {
    const json = businessHoursToJson(DEFAULT_BUSINESS_HOURS)
    const parsed = parseStoredBusinessHours(json)

    expect(parsed.source).toBe('stored')
    expect(parsed.value).toEqual(DEFAULT_BUSINESS_HOURS)
  })
})
