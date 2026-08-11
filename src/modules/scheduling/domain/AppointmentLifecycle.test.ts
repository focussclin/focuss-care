import { describe, expect, it } from 'vitest'

import type { AppointmentStatus } from '@/modules/_shared/domain/types'

import {
  allowedSourcesFor,
  canConfirm,
  canRecordOutcome,
  canTransition,
  isAppointmentOutcome,
  isTerminal,
  outcomeIsDue,
} from './AppointmentLifecycle'

const ALL: readonly AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
  'canceled',
  'no_show',
]

describe('confirmação', () => {
  it('sai de `scheduled`', () => {
    expect(canConfirm('scheduled')).toBe(true)
  })

  it('já confirmado não reconfirma', () => {
    // Não é erro do usuário: é clique sem efeito, e a tela some com o botão.
    expect(canConfirm('confirmed')).toBe(false)
  })

  it.each(['checked_in', 'in_progress', 'completed', 'canceled', 'no_show'] as const)(
    'não sai de %s',
    (status) => {
      expect(canConfirm(status)).toBe(false)
    },
  )
})

describe('desfecho', () => {
  it.each(['scheduled', 'confirmed', 'checked_in', 'in_progress'] as const)(
    'pode ser registrado a partir de %s',
    (status) => {
      expect(canRecordOutcome(status)).toBe(true)
    },
  )

  it('`scheduled` entra: nem toda clínica usa confirmação', () => {
    /*
     * Exigir confirmação como degrau obrigatório inventaria uma etapa que a
     * operação de quem marca e atende não tem — e deixaria a taxa de
     * comparecimento zerada justamente nessas clínicas.
     */
    expect(canRecordOutcome('scheduled')).toBe(true)
  })

  it.each(['completed', 'canceled', 'no_show'] as const)(
    'não sai de %s, que é terminal',
    (status) => {
      expect(canRecordOutcome(status)).toBe(false)
    },
  )

  it('só `completed` e `no_show` são desfecho', () => {
    const outcomes = ALL.filter(isAppointmentOutcome)

    expect(outcomes).toEqual(['completed', 'no_show'])
  })
})

/**
 * Reabrir um terminal reescreveria o que a clínica afirmou ter acontecido.
 */
describe('estados terminais', () => {
  it.each(['completed', 'canceled', 'no_show'] as const)('%s é terminal', (status) => {
    expect(isTerminal(status)).toBe(true)
  })

  it.each(['scheduled', 'confirmed', 'checked_in', 'in_progress'] as const)(
    '%s não é',
    (status) => {
      expect(isTerminal(status)).toBe(false)
    },
  )

  it('nada sai de um terminal', () => {
    const escapes = ALL.filter(isTerminal).flatMap((from) =>
      ALL.filter((to) => canTransition(from, to)).map((to) => `${from} -> ${to}`),
    )

    expect(escapes).toEqual([])
  })
})

describe('a transição em si', () => {
  it('o mapa completo do que é permitido', () => {
    /*
     * Escrito por extenso de propósito: é a especificação da máquina de
     * estados, e uma linha nova aqui obriga quem a acrescentar a olhar para o
     * conjunto inteiro.
     */
    const allowed = ALL.flatMap((from) =>
      ALL.filter((to) => canTransition(from, to)).map((to) => `${from} -> ${to}`),
    )

    expect(allowed).toEqual([
      'scheduled -> confirmed',
      'scheduled -> completed',
      'scheduled -> no_show',
      'confirmed -> completed',
      'confirmed -> no_show',
      'checked_in -> completed',
      'checked_in -> no_show',
      'in_progress -> completed',
      'in_progress -> no_show',
    ])
  })

  it('para o mesmo estado não é transição', () => {
    for (const status of ALL) {
      expect(canTransition(status, status)).toBe(false)
    }
  })

  it('`canceled` não é alcançável por aqui', () => {
    /*
     * Cancelar grava motivo e dispara notificação; deixar esta porta aberta
     * daria um segundo caminho que pula as duas coisas.
     */
    const toCanceled = ALL.filter((from) => canTransition(from, 'canceled'))

    expect(toCanceled).toEqual([])
  })

  it.each(['checked_in', 'in_progress'] as const)(
    '%s não é alcançável por aqui — quem move é a fila',
    (status) => {
      expect(ALL.filter((from) => canTransition(from, status))).toEqual([])
    },
  )
})

/**
 * A lista que vira condição do `UPDATE`. Se ela discordar dos predicados, o
 * banco aceita o que a tela recusa — ou o contrário.
 */
describe('origens permitidas', () => {
  it('confirmar bate com `canConfirm`', () => {
    expect([...allowedSourcesFor('confirmed')]).toEqual(ALL.filter(canConfirm))
  })

  it.each(['completed', 'no_show'] as const)('%s bate com `canRecordOutcome`', (to) => {
    expect([...allowedSourcesFor(to)]).toEqual(ALL.filter(canRecordOutcome))
  })

  it('status sem transição declarada não tem origem nenhuma', () => {
    // Lista vazia no `WHERE` alcança zero linhas — falha fechada, não aberta.
    expect(allowedSourcesFor('canceled')).toEqual([])
  })
})

/**
 * Registrar falta na véspera entraria na taxa de comparecimento como fato
 * observado.
 */
describe('quando o desfecho já pode ser registrado', () => {
  const start = new Date('2026-08-12T13:00:00.000Z')

  it('depois do horário, pode', () => {
    expect(outcomeIsDue(start, new Date('2026-08-12T13:30:00.000Z'))).toBe(true)
  })

  it('no minuto exato, pode', () => {
    // Quem não chegou na hora já faltou; esperar o fim só atrasaria a vaga.
    expect(outcomeIsDue(start, start)).toBe(true)
  })

  it('antes do horário, não', () => {
    expect(outcomeIsDue(start, new Date('2026-08-12T12:59:59.000Z'))).toBe(false)
  })
})
