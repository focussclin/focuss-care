// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { PeriodReport } from '../domain/ClinicMetrics'
import type { QueueTimes } from '../domain/QueueDurations'
import { RelatoriosScreen } from './RelatoriosScreen'

/**
 * Os tempos da fila na tela — feature **T-02**.
 *
 * O relatório é lido para decidir escala e horário. O que este arquivo protege é
 * a diferença entre um número e um número **com contexto**: a mesma "espera
 * típica de 12 min" significa coisas diferentes apoiada em 4 ou em 400
 * passagens.
 */

const period = {
  key: 'mes-atual' as const,
  label: 'Este mês',
  from: new Date(2026, 7, 1),
  to: new Date(2026, 8, 1),
}

function report(queueTimes: QueueTimes): PeriodReport {
  return {
    from: period.from,
    to: period.to,
    appointments: {
      total: 10,
      upcoming: 2,
      completed: 6,
      canceled: 1,
      noShow: 1,
    },
    newPatients: 3,
    activePatients: 40,
    attendance: { completed: 6, noShow: 1, percentage: 86 },
    byProfessional: [
      { professionalId: 'prof-1', name: 'Dra. Ana', total: 6 },
    ],
    queueTimes,
    truncated: false,
  }
}

function renderScreen(queueTimes: QueueTimes) {
  render(
    <RelatoriosScreen
      report={report(queueTimes)}
      period={period}
      isLive
    />,
  )
}

afterEach(cleanup)

describe('os tempos aparecem com a amostra', () => {
  it('mostra mediana, tamanho da amostra e pior caso', () => {
    renderScreen({
      waiting: { sample: 40, medianMinutes: 12, maxMinutes: 95 },
      service: { sample: 38, medianMinutes: 30, maxMinutes: 60 },
      stillWaiting: 0,
      truncated: false,
    })

    expect(screen.getByText('12 min')).toBeTruthy()
    // A amostra aparece SEMPRE, e não só quando é pequena.
    expect(screen.getByText(/Mediana de 40 registros/)).toBeTruthy()
    expect(screen.getByText(/maior: 1 h 35 min/)).toBeTruthy()
  })

  it('amostra pequena é declarada em vez de escondida', () => {
    /*
     * O relatório não omite o número: omitir esconderia o que a clínica tem.
     * Ele diz o que aquele número descreve — alguns atendimentos, não a rotina.
     */
    renderScreen({
      waiting: { sample: 3, medianMinutes: 12, maxMinutes: 20 },
      service: null,
      stillWaiting: 0,
      truncated: false,
    })

    expect(screen.getByText(/Amostra pequena/)).toBeTruthy()
  })

  it('amostra suficiente não recebe ressalva', () => {
    renderScreen({
      waiting: { sample: 5, medianMinutes: 12, maxMinutes: 20 },
      service: null,
      stillWaiting: 0,
      truncated: false,
    })

    expect(screen.queryByText(/Amostra pequena/)).toBeNull()
  })

  it('um dos dois tempos sem registro não apaga o outro', () => {
    // Atendimento em curso: já foi chamado e ainda não terminou.
    renderScreen({
      waiting: { sample: 6, medianMinutes: 9, maxMinutes: 25 },
      service: null,
      stillWaiting: 0,
      truncated: false,
    })

    expect(screen.getByText('9 min')).toBeTruthy()
    expect(screen.getByText('Sem registro no período.')).toBeTruthy()
  })

  it('avisa quando a leitura da fila foi limitada', () => {
    renderScreen({
      waiting: { sample: 5000, medianMinutes: 12, maxMinutes: 95 },
      service: null,
      stillWaiting: 0,
      truncated: true,
    })

    expect(
      screen.getByText(/A fila teve mais registros do que este relatório/),
    ).toBeTruthy()
  })
})

describe('quem ainda espera', () => {
  it('é contado à parte, com o motivo', () => {
    /*
     * Contar a espera em curso faria o número do período encolher a cada
     * recarga; omitir a existência dessas pessoas esconderia a fila de hoje.
     */
    renderScreen({
      waiting: { sample: 6, medianMinutes: 9, maxMinutes: 25 },
      service: null,
      stillWaiting: 3,
      truncated: false,
    })

    expect(screen.getByText(/3 pessoas ainda não foram chamadas/)).toBeTruthy()
  })

  it('no singular, a frase concorda', () => {
    renderScreen({
      waiting: null,
      service: null,
      stillWaiting: 1,
      truncated: false,
    })

    expect(screen.getByText(/1 pessoa ainda não foi chamada/)).toBeTruthy()
  })

  it('sem ninguém esperando, não há linha nenhuma', () => {
    renderScreen({
      waiting: { sample: 6, medianMinutes: 9, maxMinutes: 25 },
      service: null,
      stillWaiting: 0,
      truncated: false,
    })

    // A busca mira a frase da FILA: o rodapé do relatório também diz "ainda
    // não" sobre o faturamento, e casá-lo aqui daria um teste verde por acaso.
    expect(screen.queryByText(/ainda não (foi|foram) chamad/)).toBeNull()
  })
})

describe('período sem fila', () => {
  it('declara a ausência em vez de mostrar zero', () => {
    // "0 min" seria a leitura mais errada possível: diria que a clínica atende
    // na hora.
    renderScreen({
      waiting: null,
      service: null,
      stillWaiting: 0,
      truncated: false,
    })

    expect(
      screen.getByText('Nenhuma passagem pela fila neste período.'),
    ).toBeTruthy()
    expect(screen.queryByText('0 min')).toBeNull()
  })
})
