import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createForUser } = vi.hoisted(() => ({
  createForUser: vi.fn(),
}))

vi.mock('@/modules/notifications/infrastructure/repository', () => ({
  notificationRepositoryFor: () => ({ createForUser }),
}))

import {
  createAppointmentNotification,
  createBillingNotification,
  createEncounterNotification,
} from './operational'

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const client = {} as never

describe('notificaÃ§Ãµes operacionais', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registra chegada sem transportar o motivo da recepÃ§Ã£o', async () => {
    await createEncounterNotification({
      client,
      clinicId: CLINIC,
      userId: USER,
      kind: 'checked_in',
      patientName: 'Maria Souza',
      eventAt: '2026-08-09T13:00:00.000Z',
    })

    expect(createForUser).toHaveBeenCalledExactlyOnceWith(
      CLINIC,
      USER,
      expect.objectContaining({
        kind: 'encounter.checked_in',
        title: 'Atualização da recepção',
        link: '/atendimentos',
      }),
    )
    expect(createForUser.mock.calls[0]?.[2].body).toContain('Maria Souza')
    expect(createForUser.mock.calls[0]?.[2].body).not.toContain('dor no peito')
  })

  it('usa o contrato comum para eventos de agenda', async () => {
    await createAppointmentNotification({
      client,
      clinicId: CLINIC,
      userId: USER,
      kind: 'rescheduled',
      appointment: {
        patientName: 'Joao Lima',
        startsAt: '2026-08-09T15:30:00.000Z',
      },
    })

    expect(createForUser).toHaveBeenCalledExactlyOnceWith(
      CLINIC,
      USER,
      expect.objectContaining({
        kind: 'appointment.rescheduled',
        title: 'Agendamento remarcado',
        link: '/agenda',
      }),
    )
  })

  it('registra cobrança com valor administrativo e sem descrição clínica', async () => {
    await createBillingNotification({
      client,
      clinicId: CLINIC,
      userId: USER,
      kind: 'invoice_created',
      patientName: 'Joao Lima',
      amountCents: 12500,
    })

    expect(createForUser).toHaveBeenCalledExactlyOnceWith(
      CLINIC,
      USER,
      expect.objectContaining({
        kind: 'billing.invoice_created',
        title: 'Cobrança criada',
        body: 'Joao Lima • R$\u00a0125,00',
        link: '/financeiro',
      }),
    )
  })
})
