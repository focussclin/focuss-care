import { describe, expect, it } from 'vitest'

import { bucketOf, isOpen, OPEN_STATUSES, type Task } from './Task'

/**
 * Em que grupo a tarefa cai, e o que ainda pede alguma coisa de alguém.
 *
 * As duas regras têm bordas que só aparecem escritas, e todas são sobre o
 * relógio — por isso `now` é parâmetro. Uma função que lesse `new Date()` por
 * dentro não teria como ser testada em nenhum dos casos abaixo.
 */

const NOW = new Date('2026-08-10T14:00:00.000Z')

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Ligar para a paciente',
    notes: null,
    status: 'pending',
    source: 'manual',
    priority: 3,
    dueAt: null,
    assignee: null,
    target: {
      patientId: null,
      patientName: null,
      appointmentId: null,
      invoiceId: null,
    },
    completedAt: null,
    createdAt: NOW,
    ...overrides,
  }
}

/** Deslocamento em dias a partir de `NOW`, no fim do dia. */
function dueInDays(days: number): Date {
  const date = new Date(NOW)
  date.setDate(date.getDate() + days)
  date.setHours(23, 59, 59, 999)
  return date
}

describe('bucketOf', () => {
  it('sem prazo cai em "sem data"', () => {
    // Ninguém combinou uma data. Não é atraso, e não compete com o resto.
    expect(bucketOf(task(), NOW)).toBe('undated')
  })

  it('prazo no passado é vencida', () => {
    expect(bucketOf(task({ dueAt: dueInDays(-1) }), NOW)).toBe('overdue')
  })

  it('prazo para o fim de hoje é "hoje", e não vencida', () => {
    /*
     * A borda que mais engana. O schema grava o prazo às 23:59:59 do dia
     * escolhido justamente para isto: uma tarefa marcada para hoje não pode
     * nascer vencida às 00h01.
     */
    expect(bucketOf(task({ dueAt: dueInDays(0) }), NOW)).toBe('today')
  })

  it('amanhã já é "semana"', () => {
    expect(bucketOf(task({ dueAt: dueInDays(1) }), NOW)).toBe('week')
  })

  it('o sétimo dia ainda é "semana"', () => {
    expect(bucketOf(task({ dueAt: dueInDays(7) }), NOW)).toBe('week')
  })

  it('o oitavo dia sai para "sem data"', () => {
    /*
     * "Sem data" acumula o que não tem prazo E o que está longe demais para
     * competir com esta semana. Os dois se comportam igual na tela: não geram
     * ligação hoje.
     */
    expect(bucketOf(task({ dueAt: dueInDays(8) }), NOW)).toBe('undated')
  })

  it('"semana" é sete dias a partir de HOJE, não do calendário', () => {
    /*
     * Numa sexta-feira, a semana do calendário diria que sobram dois dias — e
     * a recepção perderia de vista o que vence na segunda.
     */
    const sexta = new Date('2026-08-14T14:00:00.000Z')
    const segunda = new Date('2026-08-17T23:59:59.999Z')

    expect(bucketOf(task({ dueAt: segunda }), sexta)).toBe('week')
  })

  it('um instante antes do fim do dia ainda é hoje', () => {
    const quase = new Date(NOW)
    quase.setHours(23, 59, 59, 998)

    expect(bucketOf(task({ dueAt: quase }), NOW)).toBe('today')
  })
})

describe('isOpen', () => {
  it('pendente e em andamento ainda pedem alguma coisa', () => {
    expect(isOpen(task({ status: 'pending' }))).toBe(true)
    expect(isOpen(task({ status: 'in_progress' }))).toBe(true)
  })

  it('concluída e cancelada não pedem mais nada', () => {
    /*
     * As duas saem por motivos opostos — "resolvi" e "não era para fazer" — e
     * a distinção importa para a contagem, não para a pendência.
     */
    expect(isOpen(task({ status: 'done' }))).toBe(false)
    expect(isOpen(task({ status: 'canceled' }))).toBe(false)
  })

  it('OPEN_STATUSES tem exatamente os dois abertos', () => {
    // Um estado novo no enum do banco que devesse contar como aberto e não
    // entrasse aqui sumiria de toda contagem de pendências, sem erro nenhum.
    expect([...OPEN_STATUSES].sort()).toEqual(['in_progress', 'pending'])
  })
})
