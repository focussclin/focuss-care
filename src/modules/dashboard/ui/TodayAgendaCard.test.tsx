// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { Appointment } from '@/modules/_shared/domain/types'

import { TodayAgendaCard } from './TodayAgendaCard'

const appointment: Appointment = {
  id: 'appointment-1',
  patientId: 'patient-1',
  patientName: 'Marina Oliveira',
  professionalId: 'professional-1',
  professionalName: 'Dra. Ana Costa',
  type: 'Consulta inicial',
  startsAt: new Date(2026, 7, 12, 9, 30),
  durationMinutes: 45,
  status: 'confirmed',
}

afterEach(cleanup)

describe('TodayAgendaCard', () => {
  it('mostra horário, paciente, profissional e status da consulta', () => {
    render(<TodayAgendaCard appointments={[appointment]} dateLabel="Hoje" />)

    expect(screen.getByText('09:30')).toBeTruthy()
    expect(screen.getByText('Marina Oliveira')).toBeTruthy()
    expect(screen.getByText('Consulta inicial · Dra. Ana Costa')).toBeTruthy()
    expect(screen.getByText('Confirmado')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /ver agenda completa/i }).getAttribute('href'),
    ).toBe('/agenda')
  })

  it('mostra ação real quando não há atendimentos', () => {
    render(<TodayAgendaCard appointments={[]} dateLabel="Hoje" />)

    expect(screen.getByText('Sua agenda está livre por enquanto.')).toBeTruthy()
    expect(
      screen.getByRole('link', { name: /adicionar atendimento/i }).getAttribute('href'),
    ).toBe('/agenda')
  })
})
