// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Appointment } from '@/modules/_shared/domain/types'

import { toAppointmentDto } from '../application/toAppointmentDto'
import { DayView } from './DayView'
import { ListView } from './ListView'
import { WeekView } from './WeekView'

/**
 * A sala na grade da agenda — as três visões.
 *
 * # A propriedade que os testes protegem
 *
 * **Sem sala não mostra nada — nem "sem sala".** O vínculo é opcional, a
 * maioria dos atendimentos não tem sala, e um rótulo de ausência repetido em
 * toda linha da agenda seria ruído sobre o caso normal. É também o que garante
 * que a tela não muda para nenhuma clínica que ainda não usa salas — que hoje
 * são todas, porque `20260809_rooms.sql` não foi aplicada.
 *
 * # Por que a visão semanal é testada por altura
 *
 * O bloco da semana revela por espaço: tipo acima de 58px, profissional acima
 * de 78px, sala acima de 98px. Um atendimento de 30 minutos não tem altura para
 * a quarta linha — e a informação não pode simplesmente sumir para quem usa
 * leitor de tela, que não é limitado por pixel. Por isso o `sr-only` traz a
 * sala mesmo no bloco curto.
 */

const DAY = new Date('2026-08-20T00:00:00.000Z')

describe('round-trip do DTO', () => {
  it('a sala atravessa a fronteira da Server Action', () => {
    /*
     * A agenda faz atualização OTIMISTA: o cartão do atendimento recém-criado é
     * montado a partir do DTO que a action devolveu, sem recarregar a página.
     *
     * `AppointmentDto` não tinha `roomName`. Quem acabasse de reservar uma sala
     * veria o cartão sem ela e concluiria que a reserva não pegou — a sala só
     * apareceria no `router.refresh()` seguinte. Nenhum teste de componente
     * pegaria isso, porque eles recebem a entidade pronta.
     */
    const dto = toAppointmentDto(appointment({ roomName: 'Consultório 1' }))

    expect(dto.roomName).toBe('Consultório 1')
  })

  it('sem sala, o campo atravessa como ausente', () => {
    expect(toAppointmentDto(appointment()).roomName).toBeUndefined()
  })
})

function appointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'a1',
    patientId: 'p1',
    patientName: 'Ana Souza',
    professionalId: 'pro1',
    professionalName: 'Dra. Marina',
    type: 'Consulta',
    startsAt: new Date('2026-08-20T13:00:00.000Z'),
    durationMinutes: 60,
    status: 'scheduled',
    ...overrides,
  }
}

afterEach(cleanup)

describe('DayView', () => {
  it('mostra a sala junto do tipo e do profissional', () => {
    render(
      <DayView
        date={DAY}
        today={DAY}
        appointments={[appointment({ roomName: 'Consultório 1' })]}
        onSelectAppointment={vi.fn()}
        onCreateAt={vi.fn()}
      />,
    )

    expect(screen.getByText(/Consultório 1/)).toBeTruthy()
  })

  it('sem sala, a linha não ganha separador solto', () => {
    /*
     * O risco concreto de concatenar com `·`: um separador órfão no fim da
     * linha ("Consulta · Dra. Marina · 60 min ·") quando não há sala.
     */
    render(
      <DayView
        date={DAY}
        today={DAY}
        appointments={[appointment()]}
        onSelectAppointment={vi.fn()}
        onCreateAt={vi.fn()}
      />,
    )

    const linha = screen.getByText(/Dra. Marina/).textContent ?? ''

    expect(linha.trimEnd().endsWith('·')).toBe(false)
    expect(linha).not.toMatch(/sem sala/i)
  })
})

describe('ListView', () => {
  it('mostra a sala quando existe', () => {
    render(
      <ListView
        appointments={[appointment({ roomName: 'Sala de exames' })]}
        today={DAY}
        onSelectAppointment={vi.fn()}
        onReschedule={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText(/Sala de exames/)).toBeTruthy()
  })

  it('sem sala, nada é acrescentado à linha', () => {
    render(
      <ListView
        appointments={[appointment()]}
        today={DAY}
        onSelectAppointment={vi.fn()}
        onReschedule={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const linha = screen.getByText(/Dra. Marina/).textContent ?? ''

    expect(linha.trimEnd().endsWith('·')).toBe(false)
    expect(linha).not.toMatch(/sem sala/i)
  })
})

describe('WeekView', () => {
  const weekStart = new Date('2026-08-17T00:00:00.000Z')

  function renderWeek(item: Appointment) {
    render(
      <WeekView
        weekStart={weekStart}
        today={DAY}
        appointments={[item]}
        onSelectAppointment={vi.fn()}
      />,
    )
  }

  it('o bloco longo mostra a sala', () => {
    // 60 minutos passa dos 98px que a quarta linha exige.
    renderWeek(appointment({ durationMinutes: 60, roomName: 'Consultório 1' }))

    expect(screen.getAllByText(/Consultório 1/).length).toBeGreaterThan(0)
  })

  it('o bloco curto não mostra a sala visualmente, mas o leitor de tela recebe', () => {
    /*
     * A metade que importa. Trinta minutos não têm altura para a quarta linha —
     * e o `sr-only` não é limitado por pixel, então quem navega por leitor de
     * tela continua sabendo onde é.
     */
    renderWeek(appointment({ durationMinutes: 30, roomName: 'Consultório 1' }))

    const descricao = screen
      .getByText(/Status: Agendado\./)
      .textContent ?? ''

    expect(descricao).toContain('Sala: Consultório 1.')
  })

  it('sem sala, a descrição acessível não inventa o campo', () => {
    renderWeek(appointment({ durationMinutes: 60 }))

    const descricao = screen.getByText(/Status: Agendado\./).textContent ?? ''

    expect(descricao).not.toMatch(/sala/i)
    expect(descricao).toContain('Dra. Marina')
  })

  it('sem sala, nenhuma linha extra aparece no bloco', () => {
    renderWeek(appointment({ durationMinutes: 60 }))

    expect(screen.queryByText(/sem sala/i)).toBeNull()
  })
})
