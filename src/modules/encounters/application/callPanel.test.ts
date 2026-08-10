import { describe, expect, it } from 'vitest'

import type { QueueEntry } from '../domain/Encounter'
import { abbreviateForPublicDisplay, buildCallPanel } from './callPanel'

/**
 * O painel de chamada da sala de espera.
 *
 * O grupo que mais importa é o de privacidade. Esta tela fica numa parede: o que
 * ela escreve é lido por estranhos, e em clínica a presença de alguém já é dado
 * de saúde por associação. Um teste que só conferisse a ordem da fila deixaria
 * passar o defeito caro — o nome completo na parede.
 */

function entry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    id: 'q-1',
    patientId: 'p-1',
    patientName: 'Maria Aparecida da Silva',
    appointmentId: null,
    professionalId: 'prof-1',
    professionalName: 'Dra. Ana Ribeiro',
    priority: 3,
    status: 'called',
    reason: 'Dor de cabeça há três dias',
    arrivedAt: new Date('2026-08-08T12:00:00.000Z'),
    calledAt: new Date('2026-08-08T12:30:00.000Z'),
    startedAt: null,
    finishedAt: null,
    ...overrides,
  }
}

describe('abreviação do nome', () => {
  it.each([
    ['Maria Aparecida da Silva', 'Maria A. S.'],
    ['João Pedro Santos', 'João P. S.'],
    ['Ana Souza', 'Ana S.'],
    ['Madonna', 'Madonna'],
    ['  Carlos   Eduardo  ', 'Carlos E.'],
  ])('%s -> %s', (full, expected) => {
    expect(abbreviateForPublicDisplay(full)).toBe(expected)
  })

  it('descarta partículas em vez de virar "D."', () => {
    expect(abbreviateForPublicDisplay('Luiz de Souza dos Santos')).toBe(
      'Luiz S. S.',
    )
  })

  it('nome vazio não vira string vazia na parede', () => {
    expect(abbreviateForPublicDisplay('   ')).toBe('Paciente')
  })
})

describe('o que NÃO vai para a parede', () => {
  it('nunca expõe o sobrenome completo', () => {
    const panel = buildCallPanel([entry()])

    expect(panel.nowCalling?.displayName).toBe('Maria A. S.')
    expect(panel.nowCalling?.displayName).not.toContain('Aparecida')
    expect(panel.nowCalling?.displayName).not.toContain('Silva')
  })

  it('não carrega motivo, id de paciente nem de agendamento', () => {
    const panel = buildCallPanel([entry()])
    const wire = JSON.stringify(panel)

    expect(wire).not.toContain('Dor de cabeça')
    expect(wire).not.toContain('p-1')
    expect(wire).not.toContain('appointmentId')
  })

  it('quem espera vira CONTAGEM, não nome — ainda não foi chamado', () => {
    const panel = buildCallPanel([
      entry({ id: 'q-1', status: 'waiting', calledAt: null }),
      entry({
        id: 'q-2',
        status: 'waiting',
        calledAt: null,
        patientName: 'Bruno Lima',
      }),
    ])

    expect(panel.waitingCount).toBe(2)
    expect(panel.nowCalling).toBeNull()
    expect(JSON.stringify(panel)).not.toContain('Bruno')
  })
})

describe('quem aparece como "chamando agora"', () => {
  it('é a última chamada feita, e não a primeira da fila', () => {
    const panel = buildCallPanel([
      entry({
        id: 'antiga',
        patientName: 'Ana Souza',
        calledAt: new Date('2026-08-08T12:10:00.000Z'),
      }),
      entry({
        id: 'recente',
        patientName: 'Bruno Lima',
        calledAt: new Date('2026-08-08T12:40:00.000Z'),
      }),
    ])

    expect(panel.nowCalling?.id).toBe('recente')
    expect(panel.nowCalling?.displayName).toBe('Bruno L.')
    expect(panel.previousCalls.map((call) => call.id)).toEqual(['antiga'])
  })

  it.each([
    ['waiting', 'waiting' as const],
    ['in_service — já saiu da sala de espera', 'in_service' as const],
    ['done', 'done' as const],
  ])('ignora quem está %s', (_label, status) => {
    const panel = buildCallPanel([entry({ status })])

    expect(panel.nowCalling).toBeNull()
  })

  it('ignora chamada sem horário — sem ela não há como ordenar', () => {
    const panel = buildCallPanel([entry({ status: 'called', calledAt: null })])

    expect(panel.nowCalling).toBeNull()
  })

  it('fila vazia não quebra a parede', () => {
    const panel = buildCallPanel([])

    expect(panel).toEqual({
      nowCalling: null,
      previousCalls: [],
      waitingCount: 0,
    })
  })

  it('mantém no máximo três chamadas anteriores', () => {
    const calls = Array.from({ length: 6 }, (_, index) =>
      entry({
        id: `q-${index}`,
        calledAt: new Date(`2026-08-08T12:${String(index).padStart(2, '0')}:00.000Z`),
      }),
    )

    const panel = buildCallPanel(calls)

    expect(panel.previousCalls).toHaveLength(3)
  })

  it('leva o profissional, que é para onde a pessoa deve ir', () => {
    const panel = buildCallPanel([entry()])

    expect(panel.nowCalling?.professionalName).toBe('Dra. Ana Ribeiro')
  })
})
