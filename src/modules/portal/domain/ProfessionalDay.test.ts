import { describe, expect, it } from 'vitest'

import type { Appointment, AppointmentStatus } from '@/modules/_shared/domain/types'

import {
  isOverdue,
  splitDay,
  summarize,
  type PortalTask,
} from './ProfessionalDay'

/**
 * A regra de "o que eu tenho pela frente agora".
 *
 * Todos os casos de borda desta função são sobre o relógio, e é por isso que
 * `now` é parâmetro: com `new Date()` lá dentro, nenhum deles seria testável.
 *
 * O teste que mais importa é o da **partição**. A primeira versão de `splitDay`
 * tinha três grupos, e um atendimento que começou às 8h e ninguém encerrou não
 * era nenhum deles — sumia da tela. Sumir é o pior desfecho aqui, porque a
 * ausência se parece com "não havia nada marcado", e o profissional só descobre
 * quando a recepção pergunta por que a sala não foi liberada.
 */

const NOW = new Date('2026-08-10T14:00:00.000Z')

function appointment(
  overrides: Partial<Appointment> & { id: string },
): Appointment {
  return {
    patientId: `p-${overrides.id}`,
    patientName: 'Ana Souza',
    professionalId: 'prof-1',
    professionalName: 'Dra. Marina',
    type: 'Consulta',
    startsAt: NOW,
    durationMinutes: 30,
    status: 'scheduled' as AppointmentStatus,
    ...overrides,
  }
}

/** Minutos a partir de `NOW`. Negativo é passado. */
function at(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60_000)
}

describe('splitDay', () => {
  it('devolve tudo vazio quando não há nada marcado', () => {
    const day = splitDay([], NOW)

    expect(day).toEqual({
      current: null,
      unclosed: [],
      upcoming: [],
      finished: [],
    })
  })

  it('o atendimento em curso é o que contém o instante', () => {
    const day = splitDay(
      [appointment({ id: 'a', startsAt: at(-10), durationMinutes: 30 })],
      NOW,
    )

    expect(day.current?.id).toBe('a')
    expect(day.upcoming).toEqual([])
    expect(day.unclosed).toEqual([])
  })

  it('o que ainda não começou é "a seguir", em ordem de horário', () => {
    const day = splitDay(
      [
        appointment({ id: 'tarde', startsAt: at(120) }),
        appointment({ id: 'logo', startsAt: at(30) }),
      ],
      NOW,
    )

    expect(day.current).toBeNull()
    expect(day.upcoming.map((item) => item.id)).toEqual(['logo', 'tarde'])
  })

  it('o que começou e não foi encerrado NÃO some', () => {
    /*
     * O defeito que originou o quarto grupo. Às 14h, uma consulta das 8h ainda
     * `scheduled` não está acontecendo, não está por vir e não está encerrada.
     */
    const day = splitDay(
      [appointment({ id: 'manha', startsAt: at(-360), durationMinutes: 30 })],
      NOW,
    )

    expect(day.current).toBeNull()
    expect(day.unclosed.map((item) => item.id)).toEqual(['manha'])
    expect(day.upcoming).toEqual([])
    expect(day.finished).toEqual([])
  })

  it('nenhum atendimento fica fora dos quatro grupos', () => {
    /*
     * A propriedade que o teste anterior verifica num caso, esta verifica em
     * geral: a soma dos grupos é o total. Uma regra nova que esqueça um estado
     * do enum `appointment_status` falha aqui, e não em produção.
     */
    const todos: Appointment[] = [
      appointment({ id: 'a', startsAt: at(-360) }),
      appointment({ id: 'b', startsAt: at(-10) }),
      appointment({ id: 'c', startsAt: at(60) }),
      appointment({ id: 'd', status: 'completed', startsAt: at(-120) }),
      appointment({ id: 'e', status: 'canceled', startsAt: at(-90) }),
      appointment({ id: 'f', status: 'no_show', startsAt: at(-60) }),
      appointment({ id: 'g', status: 'checked_in', startsAt: at(90) }),
      appointment({ id: 'h', status: 'in_progress', startsAt: at(-5) }),
      appointment({ id: 'i', status: 'confirmed', startsAt: at(180) }),
    ]

    const day = splitDay(todos, NOW)
    const vistos = [
      ...(day.current ? [day.current] : []),
      ...day.unclosed,
      ...day.upcoming,
      ...day.finished,
    ]

    expect(vistos).toHaveLength(todos.length)
    expect(new Set(vistos.map((item) => item.id)).size).toBe(todos.length)
  })

  it('cancelado e falta ficam com os encerrados, não somem', () => {
    /*
     * O profissional precisa saber que o horário das 14h vagou — e não apenas
     * que ele desapareceu da lista. É o mesmo motivo por que a agenda não
     * apaga o cancelado.
     */
    const day = splitDay(
      [
        appointment({ id: 'cancelado', status: 'canceled', startsAt: at(-30) }),
        appointment({ id: 'faltou', status: 'no_show', startsAt: at(-60) }),
      ],
      NOW,
    )

    expect(day.finished.map((item) => item.id)).toEqual(['faltou', 'cancelado'])
    expect(day.current).toBeNull()
  })

  it('com dois em curso, o de agora é o que começou por último', () => {
    /*
     * Sobreposição a agenda recusa criar desde `20260808_appointments_no_overlap`,
     * mas linha anterior a ela existe. O que começou por último é o que tem
     * alguém na sala; o outro vai para `unclosed`, e não para o limbo.
     */
    const day = splitDay(
      [
        appointment({ id: 'antigo', startsAt: at(-20), durationMinutes: 60 }),
        appointment({ id: 'recente', startsAt: at(-5), durationMinutes: 60 }),
      ],
      NOW,
    )

    expect(day.current?.id).toBe('recente')
    expect(day.unclosed.map((item) => item.id)).toEqual(['antigo'])
  })

  it('o instante exato do início já conta como em curso', () => {
    const day = splitDay(
      [appointment({ id: 'a', startsAt: NOW, durationMinutes: 30 })],
      NOW,
    )

    expect(day.current?.id).toBe('a')
  })

  it('o instante exato do fim já saiu de curso', () => {
    /*
     * Janela `[início, fim)`: às 14h em ponto, a consulta das 13h30 às 14h
     * acabou. Fechar o intervalo dos dois lados faria duas consultas
     * consecutivas estarem "acontecendo agora" no minuto da troca.
     */
    const day = splitDay(
      [appointment({ id: 'a', startsAt: at(-30), durationMinutes: 30 })],
      NOW,
    )

    expect(day.current).toBeNull()
    expect(day.unclosed.map((item) => item.id)).toEqual(['a'])
  })
})

describe('summarize', () => {
  const task = (overrides: Partial<PortalTask> & { id: string }): PortalTask => ({
    title: 'Ligar para a paciente',
    dueAt: null,
    priority: 3,
    patientName: null,
    ...overrides,
  })

  it('conta o que ainda pede ação e o que já saiu', () => {
    const day = splitDay(
      [
        appointment({ id: 'agora', startsAt: at(-5) }),
        appointment({ id: 'depois', startsAt: at(60) }),
        appointment({ id: 'feito', status: 'completed', startsAt: at(-120) }),
      ],
      NOW,
    )

    const resumo = summarize(day, [], NOW)

    expect(resumo.remaining).toBe(2)
    expect(resumo.finished).toBe(1)
  })

  it('o não encerrado conta como restante', () => {
    /*
     * Sem isto, o cartão diria "nada pela frente" com três consultas abertas
     * na tela logo abaixo — e encerrar é ação que só esta pessoa faz.
     */
    const day = splitDay(
      [appointment({ id: 'manha', startsAt: at(-360) })],
      NOW,
    )

    expect(summarize(day, [], NOW).remaining).toBe(1)
  })

  it('separa tarefa vencida de tarefa apenas aberta', () => {
    const day = splitDay([], NOW)

    const resumo = summarize(
      day,
      [
        task({ id: 'vencida', dueAt: at(-60) }),
        task({ id: 'hoje', dueAt: at(60) }),
        task({ id: 'sem prazo' }),
      ],
      NOW,
    )

    expect(resumo.openTasks).toBe(3)
    expect(resumo.overdueTasks).toBe(1)
  })

  it('tarefa sem prazo nunca está vencida', () => {
    // Sem prazo não é atraso: ninguém combinou uma data para ela.
    expect(isOverdue(task({ id: 'a' }), NOW)).toBe(false)
  })

  it('o prazo no instante exato ainda não venceu', () => {
    expect(isOverdue(task({ id: 'a', dueAt: NOW }), NOW)).toBe(false)
  })
})
