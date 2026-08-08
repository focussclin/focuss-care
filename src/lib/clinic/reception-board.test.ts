import { describe, expect, it } from 'vitest'

import {
  buildReceptionBoard,
  type ArrivedEntry,
  type ScheduledSlot,
} from './reception-board'

/**
 * O quadro da recepção.
 *
 * O defeito caro aqui é chamar de atrasado quem já está na sala: a recepção
 * liga para alguém que está sentado na frente dela, e para de confiar na tela.
 * O segundo é o oposto — sumir com quem realmente não veio.
 */

const NOW = new Date('2026-08-08T14:30:00.000Z')

function slot(overrides: Partial<ScheduledSlot> = {}): ScheduledSlot {
  return {
    id: 'apt-1',
    patientName: 'Maria Silva',
    professionalName: 'Dra. Ana Ribeiro',
    startsAt: new Date('2026-08-08T15:00:00.000Z'),
    status: 'scheduled',
    ...overrides,
  }
}

function arrived(appointmentId: string | null): ArrivedEntry {
  return { appointmentId }
}

describe('quem ainda é esperado', () => {
  it('lista quem tem hora marcada e não chegou', () => {
    const board = buildReceptionBoard([slot()], [], NOW)

    expect(board.expected.map((item) => item.id)).toEqual(['apt-1'])
    expect(board.late).toEqual([])
  })

  it('ordena por horário — a recepção lê de cima para baixo', () => {
    const board = buildReceptionBoard(
      [
        slot({ id: 'tarde', startsAt: new Date('2026-08-08T17:00:00.000Z') }),
        slot({ id: 'cedo', startsAt: new Date('2026-08-08T15:00:00.000Z') }),
      ],
      [],
      NOW,
    )

    expect(board.expected.map((item) => item.id)).toEqual(['cedo', 'tarde'])
  })
})

describe('quem já chegou some das duas listas', () => {
  it('não cobra presença de quem deu entrada', () => {
    const board = buildReceptionBoard([slot()], [arrived('apt-1')], NOW)

    expect(board.expected).toEqual([])
    expect(board.late).toEqual([])
    expect(board.arrivedCount).toBe(1)
  })

  it('encaixe não apaga ninguém — ele nunca foi esperado', () => {
    // Entrada sem hora marcada chega com `appointmentId` nulo. Se ela casasse
    // com qualquer horário, um encaixe faria sumir um paciente que não veio.
    const board = buildReceptionBoard([slot()], [arrived(null)], NOW)

    expect(board.expected.map((item) => item.id)).toEqual(['apt-1'])
    expect(board.arrivedCount).toBe(1)
  })
})

describe('atraso', () => {
  it('passa para "atrasado" só depois da tolerância', () => {
    const cincoMin = new Date('2026-08-08T14:25:00.000Z')
    const vinteMin = new Date('2026-08-08T14:10:00.000Z')

    const board = buildReceptionBoard(
      [
        slot({ id: 'no-limite', startsAt: cincoMin }),
        slot({ id: 'atrasado', startsAt: vinteMin }),
      ],
      [],
      NOW,
    )

    expect(board.expected.map((item) => item.id)).toEqual(['no-limite'])
    expect(board.late.map((item) => item.id)).toEqual(['atrasado'])
  })

  it('conta os minutos de atraso', () => {
    const board = buildReceptionBoard(
      [slot({ startsAt: new Date('2026-08-08T14:00:00.000Z') })],
      [],
      NOW,
    )

    expect(board.late[0].lateMinutes).toBe(30)
  })

  it('quem ainda vai acontecer tem atraso zero, não negativo', () => {
    const board = buildReceptionBoard([slot()], [], NOW)

    expect(board.expected[0].lateMinutes).toBe(0)
  })

  it('o mais atrasado vem primeiro — é a ordem de ligar', () => {
    const board = buildReceptionBoard(
      [
        slot({ id: 'pouco', startsAt: new Date('2026-08-08T14:15:00.000Z') }),
        slot({ id: 'muito', startsAt: new Date('2026-08-08T13:00:00.000Z') }),
      ],
      [],
      NOW,
    )

    expect(board.late.map((item) => item.id)).toEqual(['muito', 'pouco'])
  })
})

describe('status que não esperam ninguém na porta', () => {
  it.each([
    ['checked_in — já está dentro', 'checked_in'],
    ['in_progress — está sendo atendido', 'in_progress'],
    ['completed — já foi embora', 'completed'],
    ['canceled — não vem', 'canceled'],
    ['no_show — já foi dado como falta', 'no_show'],
  ])('ignora %s', (_label, status) => {
    const board = buildReceptionBoard(
      [slot({ status, startsAt: new Date('2026-08-08T13:00:00.000Z') })],
      [],
      NOW,
    )

    expect(board.late).toEqual([])
    expect(board.expected).toEqual([])
  })

  it.each([['scheduled'], ['confirmed']])('aguarda %s', (status) => {
    const board = buildReceptionBoard([slot({ status })], [], NOW)

    expect(board.expected).toHaveLength(1)
  })
})

describe('dia vazio', () => {
  it('não quebra sem agenda e sem fila', () => {
    expect(buildReceptionBoard([], [], NOW)).toEqual({
      late: [],
      expected: [],
      arrivedCount: 0,
    })
  })
})
