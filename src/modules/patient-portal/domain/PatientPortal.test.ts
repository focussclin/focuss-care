import { describe, expect, it } from 'vitest'

import type { AppointmentStatus } from '@/modules/_shared/domain/types'

import {
  isSettled,
  outstandingCents,
  splitAppointments,
  type PortalAppointment,
  type PortalInvoice,
} from './PatientPortal'

const NOW = new Date('2026-08-10T14:00:00.000Z')

function at(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60_000)
}

function appointment(
  overrides: Partial<PortalAppointment> & { id: string },
): PortalAppointment {
  return {
    startsAt: at(60),
    endsAt: at(90),
    status: 'scheduled' as AppointmentStatus,
    reason: 'Retorno',
    professionalName: 'Dra. Marina',
    ...overrides,
  }
}

function invoice(overrides: Partial<PortalInvoice> & { id: string }): PortalInvoice {
  return {
    status: 'issued',
    issueDate: null,
    dueDate: null,
    totalCents: 20000,
    paidCents: 0,
    ...overrides,
  }
}

describe('splitAppointments', () => {
  it('separa o que vem pela frente do que já passou', () => {
    const { upcoming, past } = splitAppointments(
      [
        appointment({ id: 'passada', startsAt: at(-120), endsAt: at(-90) }),
        appointment({ id: 'futura', startsAt: at(120), endsAt: at(150) }),
      ],
      NOW,
    )

    expect(upcoming.map((item) => item.id)).toEqual(['futura'])
    expect(past.map((item) => item.id)).toEqual(['passada'])
  })

  it('cancelada no futuro NÃO é compromisso, mas continua visível', () => {
    /*
     * As duas metades importam. Mostrá-la como "próxima" faria a pessoa
     * aparecer na clínica num horário que não existe mais; sumir com ela faria
     * a pessoa aparecer do mesmo jeito, sem nunca ter sido avisada.
     */
    const { upcoming, past } = splitAppointments(
      [
        appointment({
          id: 'cancelada',
          startsAt: at(1440),
          endsAt: at(1470),
          status: 'canceled',
        }),
      ],
      NOW,
    )

    expect(upcoming).toEqual([])
    expect(past.map((item) => item.id)).toEqual(['cancelada'])
  })

  it('falta registrada também sai das próximas', () => {
    const { upcoming, past } = splitAppointments(
      [
        appointment({
          id: 'faltou',
          startsAt: at(600),
          endsAt: at(630),
          status: 'no_show',
        }),
      ],
      NOW,
    )

    expect(upcoming).toEqual([])
    expect(past).toHaveLength(1)
  })

  it('nenhuma consulta se perde entre os dois grupos', () => {
    const todas = [
      appointment({ id: 'a', startsAt: at(-300) }),
      appointment({ id: 'b', startsAt: at(300) }),
      appointment({ id: 'c', startsAt: at(300), status: 'canceled' }),
      appointment({ id: 'd', startsAt: at(-60), status: 'completed' }),
      appointment({ id: 'e', startsAt: at(30), status: 'confirmed' }),
    ]

    const { upcoming, past } = splitAppointments(todas, NOW)

    expect(upcoming.length + past.length).toBe(todas.length)
  })

  it('próximas em ordem crescente, histórico em decrescente', () => {
    // Quem olha o futuro quer o mais próximo primeiro; quem olha o passado
    // quer o mais recente.
    const { upcoming, past } = splitAppointments(
      [
        appointment({ id: 'f2', startsAt: at(600) }),
        appointment({ id: 'f1', startsAt: at(60) }),
        appointment({ id: 'p2', startsAt: at(-600), status: 'completed' }),
        appointment({ id: 'p1', startsAt: at(-60), status: 'completed' }),
      ],
      NOW,
    )

    expect(upcoming.map((item) => item.id)).toEqual(['f1', 'f2'])
    expect(past.map((item) => item.id)).toEqual(['p1', 'p2'])
  })

  it('o corte é o INÍCIO, não o fim', () => {
    /*
     * Uma consulta que começou há dez minutos já não é "próxima" para quem
     * está na sala de espera olhando o celular.
     */
    const { upcoming, past } = splitAppointments(
      [appointment({ id: 'correndo', startsAt: at(-10), endsAt: at(20) })],
      NOW,
    )

    expect(upcoming).toEqual([])
    expect(past.map((item) => item.id)).toEqual(['correndo'])
  })
})

describe('saldo da cobrança', () => {
  it('o que falta é total menos pago', () => {
    expect(
      outstandingCents(invoice({ id: 'a', totalCents: 20000, paidCents: 5000 })),
    ).toBe(15000)
  })

  it('pagamento a mais não vira crédito negativo', () => {
    // Um número negativo na tela do paciente seria lido como dívida da clínica
    // com ele — promessa que este portal não pode fazer.
    expect(
      outstandingCents(invoice({ id: 'a', totalCents: 10000, paidCents: 12000 })),
    ).toBe(0)
  })

  it('saldo zerado é quitada mesmo com status atrasado', () => {
    /*
     * `status` é escrito pelo financeiro e pode ficar para trás de um pagamento
     * recém-registrado. Dizer "vencida" para quem já pagou é o erro que gera
     * ligação — e desconfiança, que custa mais.
     */
    const paga = invoice({
      id: 'a',
      status: 'overdue',
      totalCents: 15000,
      paidCents: 15000,
    })

    expect(isSettled(paga)).toBe(true)
  })

  it('pagamento parcial não é quitação', () => {
    expect(
      isSettled(invoice({ id: 'a', totalCents: 15000, paidCents: 14999 })),
    ).toBe(false)
  })
})
