import { describe, expect, it } from 'vitest'

import { bucketOf, type Task } from '../domain/Task'
import { toTaskDto, toTaskGroups } from './toTaskDto'

/**
 * O agrupamento por prazo e a frase do vencimento.
 *
 * É aqui que a tela decide o que a recepção vê primeiro, e os erros são todos
 * silenciosos: uma tarefa que cai no grupo errado não dá erro, só some do campo
 * de visão de quem deveria agir.
 *
 * A frase do prazo é testada pelo `dueLabel` do DTO, e não por uma função
 * exportada — ela é interna a `toTaskDto` de propósito, para não existirem duas
 * formas de dizer a mesma data no produto.
 */

const NOW = new Date('2026-08-09T14:00:00')

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Ligar para a paciente que faltou',
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
    createdAt: new Date('2026-08-01T10:00:00'),
    ...overrides,
  }
}

describe('em que grupo a tarefa cai', () => {
  it.each([
    ['sem prazo', null, 'undated'],
    ['venceu ontem', new Date('2026-08-08T23:59:59'), 'overdue'],
    ['vence hoje mais tarde', new Date('2026-08-09T18:00:00'), 'today'],
    ['vence em três dias', new Date('2026-08-12T12:00:00'), 'week'],
    ['vence em vinte dias', new Date('2026-08-29T12:00:00'), 'undated'],
  ])('%s -> %s', (_label, dueAt, expected) => {
    expect(bucketOf(task({ dueAt }), NOW)).toBe(expected)
  })

  it('prazo já passado HOJE conta como vencido, não como "hoje"', () => {
    // 10h de hoje, com agora às 14h: a pessoa já deveria ter ligado.
    expect(bucketOf(task({ dueAt: new Date('2026-08-09T10:00:00') }), NOW)).toBe(
      'overdue',
    )
  })

  it('"esta semana" são sete dias corridos, não o resto do calendário', () => {
    /*
     * Numa sexta-feira o calendário diria que só sobram dois dias, e o que
     * vence na segunda sairia do campo de visão de quem trabalha na sexta.
     */
    const sexta = new Date('2026-08-14T09:00:00')
    const segunda = new Date('2026-08-17T12:00:00')

    expect(bucketOf(task({ dueAt: segunda }), sexta)).toBe('week')
  })
})

describe('a frase do prazo', () => {
  function labelOf(dueAt: Date): string | null {
    return toTaskDto(task({ dueAt }), NOW).dueLabel
  }

  it.each([
    ['vence hoje', new Date('2026-08-09T18:00:00'), /vence hoje/],
    ['vence amanhã', new Date('2026-08-10T12:00:00'), /vence amanhã/],
    ['vence em dias', new Date('2026-08-13T12:00:00'), /vence em \d+ dias/],
    ['venceu hoje', new Date('2026-08-09T10:00:00'), /venceu hoje/],
    ['venceu há dias', new Date('2026-08-04T12:00:00'), /venceu há \d+ dias/],
  ])('%s', (_label, dueAt, expected) => {
    expect(labelOf(dueAt)).toMatch(expected)
  })

  it('não usa número negativo para atraso', () => {
    expect(labelOf(new Date('2026-08-01T12:00:00'))).not.toContain('-')
  })

  it('sem prazo não inventa frase', () => {
    expect(toTaskDto(task(), NOW).dueLabel).toBeNull()
  })

  it('singular e plural concordam', () => {
    expect(labelOf(new Date('2026-08-08T12:00:00'))).toBe('venceu há 1 dia')
    expect(labelOf(new Date('2026-08-07T12:00:00'))).toBe('venceu há 2 dias')
  })
})

describe('grupos montados para a tela', () => {
  it('vem na ordem em que a recepção age', () => {
    const groups = toTaskGroups(
      [
        task({ id: 'sem-prazo' }),
        task({ id: 'semana', dueAt: new Date('2026-08-12T12:00:00') }),
        task({ id: 'vencida', dueAt: new Date('2026-08-05T12:00:00') }),
        task({ id: 'hoje', dueAt: new Date('2026-08-09T20:00:00') }),
      ],
      NOW,
    )

    expect(groups.map((group) => group.bucket)).toEqual([
      'overdue',
      'today',
      'week',
      'undated',
    ])
  })

  it('grupo vazio não vira cabeçalho sem conteúdo', () => {
    const groups = toTaskGroups(
      [task({ dueAt: new Date('2026-08-05T12:00:00') })],
      NOW,
    )

    expect(groups).toHaveLength(1)
    expect(groups[0].bucket).toBe('overdue')
  })

  it('lista vazia devolve nenhum grupo', () => {
    expect(toTaskGroups([], NOW)).toEqual([])
  })

  it('dentro do grupo, a prioridade decide', () => {
    const groups = toTaskGroups(
      [
        task({
          id: 'normal',
          priority: 3,
          dueAt: new Date('2026-08-05T12:00:00'),
        }),
        task({ id: 'alta', priority: 1, dueAt: new Date('2026-08-05T12:00:00') }),
      ],
      NOW,
    )

    expect(groups[0].tasks.map((item) => item.id)).toEqual(['alta', 'normal'])
  })
})

describe('o alvo da tarefa', () => {
  it('paciente vira link para a ficha', () => {
    const dto = toTaskDto(
      task({
        target: {
          patientId: '9019956f-bdd8-4d61-868d-09b02332dad0',
          patientName: 'Maria Silva',
          appointmentId: null,
          invoiceId: null,
        },
      }),
      NOW,
    )

    expect(dto.target).toEqual({
      label: 'Maria Silva',
      href: '/pacientes/9019956f-bdd8-4d61-868d-09b02332dad0',
    })
  })

  it('atendimento e fatura NÃO viram link — não há rota para eles', () => {
    /*
     * Os dois têm id no banco e nenhuma rota própria no produto. Inventar
     * `/atendimentos/<id>` daria um link quebrado, que é pior que nenhum.
     */
    const dto = toTaskDto(
      task({
        target: {
          patientId: null,
          patientName: null,
          appointmentId: 'apt-1',
          invoiceId: 'inv-1',
        },
      }),
      NOW,
    )

    expect(dto.target).toBeNull()
  })

  it('paciente sem nome carregado não vira link vazio', () => {
    const dto = toTaskDto(
      task({
        target: {
          patientId: 'p-1',
          patientName: null,
          appointmentId: null,
          invoiceId: null,
        },
      }),
      NOW,
    )

    expect(dto.target).toBeNull()
  })
})
