// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  confirm: vi.fn(),
  outcome: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }),
}))

vi.mock('../actions/cancelAppointment.action', () => ({
  cancelAppointmentAction: mocks.cancel,
}))

vi.mock('../actions/appointmentLifecycle.action', () => ({
  confirmAppointmentAction: mocks.confirm,
  recordAppointmentOutcomeAction: mocks.outcome,
}))

import type { Appointment, Professional } from '@/modules/_shared/domain/types'

import type { AgendaScreenProps } from './AgendaScreen'
import { AgendaScreen } from './AgendaScreen'

afterEach(cleanup)

const professional: Professional = {
  id: '00000000-0000-4000-8000-000000000003',
  name: 'Dra. Marina',
  specialty: 'Clínica geral',
}

const appointment: Appointment = {
  id: '00000000-0000-4000-8000-000000000001',
  patientId: '00000000-0000-4000-8000-000000000002',
  patientName: 'Ana Souza',
  professionalId: professional.id,
  professionalName: professional.name,
  type: 'Consulta',
  startsAt: new Date(2026, 7, 13, 9, 0),
  durationMinutes: 30,
  status: 'scheduled',
}

beforeEach(() => {
  mocks.cancel.mockReset()
  mocks.confirm.mockReset()
  mocks.outcome.mockReset()
  mocks.refresh.mockReset()
  mocks.replace.mockReset()

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
})

function renderAgenda(overrides: Partial<AgendaScreenProps> = {}) {
  const props: AgendaScreenProps = {
    today: new Date(2026, 7, 13, 8, 0),
    initialAppointments: [appointment],
    patients: [],
    professionals: [professional],
    isLive: true,
    renderPatientField: () => <div data-testid="patient-field" />,
    ...overrides,
  }

  return render(<AgendaScreen {...props} />)
}

async function openDetails() {
  fireEvent.click(screen.getByRole('button', { name: /09:00Ana Souza/ }))
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Detalhes do atendimento' })).toBeTruthy(),
  )
}

describe('AgendaScreen — falhas de transporte', () => {
  it('mantém a confirmação aberta e mostra erro quando cancelar perde a conexão', async () => {
    mocks.cancel.mockRejectedValueOnce(new Error('network'))
    renderAgenda()
    await openDetails()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar atendimento' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar atendimento' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Não foi possível cancelar o atendimento agora.',
      ),
    )
    expect(screen.getByRole('heading', { name: 'Detalhes do atendimento' })).toBeTruthy()
  })

  it('mantém o atendimento aberto e informa erro ao confirmar presença sem rede', async () => {
    mocks.confirm.mockRejectedValueOnce(new Error('network'))
    renderAgenda()
    await openDetails()

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar presença' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Não foi possível confirmar o atendimento agora.',
      ),
    )
    expect(screen.getByRole('heading', { name: 'Detalhes do atendimento' })).toBeTruthy()
  })
})
