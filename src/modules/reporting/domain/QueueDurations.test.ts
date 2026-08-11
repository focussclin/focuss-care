import { describe, expect, it } from 'vitest'

import {
  durationMinutes,
  formatMinutes,
  isRepresentative,
  median,
  MIN_QUEUE_SAMPLE,
  summarizeQueueTimes,
  type QueueVisit,
} from './QueueDurations'

/**
 * Os tempos da fila — feature **T-02**.
 *
 * A porta do relatório declarava a ausência: "tempo médio de espera seria
 * derivável de `waiting_queue`, e entra quando houver volume suficiente para a
 * média significar alguma coisa". O que se prova aqui é o outro lado dessa
 * frase: o número existe, e vem acompanhado do tamanho da amostra.
 */

const ARRIVED = new Date('2026-08-11T13:00:00.000Z')

function visit(overrides: Partial<QueueVisit> = {}): QueueVisit {
  return {
    arrivedAt: ARRIVED,
    calledAt: new Date('2026-08-11T13:10:00.000Z'),
    startedAt: new Date('2026-08-11T13:12:00.000Z'),
    finishedAt: new Date('2026-08-11T13:42:00.000Z'),
    ...overrides,
  }
}

function minutesAfter(base: Date, minutes: number): Date {
  return new Date(base.getTime() + minutes * 60_000)
}

describe('duração entre dois carimbos', () => {
  it('devolve minutos inteiros', () => {
    expect(durationMinutes(ARRIVED, minutesAfter(ARRIVED, 12))).toBe(12)
  })

  it('sem o segundo carimbo, não há duração', () => {
    expect(durationMinutes(ARRIVED, null)).toBeNull()
  })

  it('duração negativa é descartada, e não corrigida para zero', () => {
    /*
     * Os dois carimbos saem do relógio do servidor, então isto não deveria
     * existir. Uma linha corrigida à mão no banco faria a mediana despencar sem
     * que ninguém entendesse por quê — um número impossível some da conta.
     */
    expect(durationMinutes(ARRIVED, minutesAfter(ARRIVED, -5))).toBeNull()
  })

  it('zero é duração legítima: chamado na hora', () => {
    expect(durationMinutes(ARRIVED, ARRIVED)).toBe(0)
  })
})

describe('mediana', () => {
  it('com amostra ímpar, é o valor central', () => {
    expect(median([10, 2, 30])).toBe(10)
  })

  it('com amostra par, é a média dos dois centrais', () => {
    // O atalho de pegar só o de baixo desloca o número para baixo justamente
    // nas amostras pequenas, que são as que esta tela mais mostra.
    expect(median([10, 20])).toBe(15)
    expect(median([4, 10, 20, 30])).toBe(15)
  })

  it('não se deixa levar por um caso extremo', () => {
    /*
     * Quem chegou três horas adiantado destrói a média do dia. A mediana
     * descreve o que aconteceu com a maioria, que é a pergunta de quem
     * gerencia a sala de espera.
     */
    const values = [5, 6, 7, 8, 180]

    expect(median(values)).toBe(7)
  })
})

describe('resumo do período', () => {
  it('mede espera e duração a partir das mesmas passagens', () => {
    const times = summarizeQueueTimes([
      visit(),
      visit({ calledAt: minutesAfter(ARRIVED, 20) }),
    ])

    expect(times.waiting).toEqual({
      sample: 2,
      medianMinutes: 15,
      maxMinutes: 20,
    })
    expect(times.service?.sample).toBe(2)
  })

  it('quem ainda não foi chamado fica FORA da espera, e é contado à parte', () => {
    /*
     * Contá-la com o tempo até agora faria a espera do período encolher toda vez
     * que a página fosse aberta; contá-la como zero seria pior.
     */
    const times = summarizeQueueTimes([
      visit(),
      visit({ calledAt: null, startedAt: null, finishedAt: null }),
    ])

    expect(times.waiting?.sample).toBe(1)
    expect(times.stillWaiting).toBe(1)
  })

  it('atendimento em curso entra na espera e não na duração', () => {
    // Já foi chamado e ainda não terminou: forçá-lo nas duas contas exigiria
    // inventar um fim que não aconteceu.
    const times = summarizeQueueTimes([visit({ finishedAt: null })])

    expect(times.waiting?.sample).toBe(1)
    expect(times.service).toBeNull()
    expect(times.stillWaiting).toBe(0)
  })

  it('sem passagem nenhuma, os dois tempos são null — e não zero', () => {
    // "0 min" diria que a clínica atende na hora.
    const times = summarizeQueueTimes([])

    expect(times).toEqual({
      waiting: null,
      service: null,
      stillWaiting: 0,
      truncated: false,
    })
  })

  it('a maior espera é o pior caso observado, não uma estimativa', () => {
    const times = summarizeQueueTimes([
      visit({ calledAt: minutesAfter(ARRIVED, 5) }),
      visit({ calledAt: minutesAfter(ARRIVED, 95) }),
    ])

    expect(times.waiting?.maxMinutes).toBe(95)
  })
})

describe('a amostra sustenta a leitura?', () => {
  it('abaixo do mínimo, não', () => {
    const times = summarizeQueueTimes(
      Array.from({ length: MIN_QUEUE_SAMPLE - 1 }, () => visit()),
    )

    expect(isRepresentative(times.waiting)).toBe(false)
  })

  it('no mínimo, sim', () => {
    const times = summarizeQueueTimes(
      Array.from({ length: MIN_QUEUE_SAMPLE }, () => visit()),
    )

    expect(isRepresentative(times.waiting)).toBe(true)
  })

  it('sem amostra nenhuma, não', () => {
    expect(isRepresentative(null)).toBe(false)
  })
})

describe('formato lido na tela', () => {
  it('abaixo de uma hora, minutos', () => {
    expect(formatMinutes(8)).toBe('8 min')
    expect(formatMinutes(59)).toBe('59 min')
  })

  it('acima, horas e minutos', () => {
    expect(formatMinutes(85)).toBe('1 h 25 min')
    expect(formatMinutes(120)).toBe('2 h')
  })
})
