import { describe, expect, it, vi } from 'vitest'

import { SupabaseAppointmentRepository } from './SupabaseAppointmentRepository'

/**
 * O que as exceções de disponibilidade fazem com o agendamento.
 *
 * Sem banco e sem rede — o cliente é um duplo. `availability_exceptions` já
 * existe no schema aplicado, e até esta fatia **nada a lia**: a tabela guardava
 * bloqueios que não bloqueavam nada.
 *
 * # As duas recusas não são a mesma coisa
 *
 * `outside-business-hours` é inferência sobre o horário padrão declarado, e a
 * action a transforma em pergunta — encaixe fora do expediente acontece, e
 * proibi-lo faria a recepção registrar hora falsa.
 *
 * `blocked-window` é alguém que digitou "25/12, clínica fechada" ou "férias da
 * Dra. Ana". Deixar confirmar por cima transformaria a decisão num aviso, e o
 * bloqueio existe exatamente para não depender de alguém lembrar.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const PATIENT = '11111111-1111-4111-8111-111111111111'
const PROFESSIONAL = '22222222-2222-4222-8222-222222222222'
const OTHER_PROFESSIONAL = '33333333-3333-4333-8333-333333333333'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'

/** Seg–sex, 08:00 às 18:00 — o mesmo formato de `clinic_settings`. */
const storedWeek = {
  days: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    closed: weekday > 5,
    opensAt: '08:00',
    closesAt: '18:00',
  })),
}

function exceptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    clinic_id: CLINIC,
    professional_id: null,
    kind: 'block',
    starts_at: '2026-08-12T00:00:00.000Z',
    ends_at: '2026-08-13T00:00:00.000Z',
    reason: 'Feriado municipal',
    created_at: '2026-08-01T10:00:00.000Z',
    professional: null,
    ...overrides,
  }
}

function appointmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    patient_id: PATIENT,
    professional_id: PROFESSIONAL,
    reason: 'Consulta de rotina',
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    status: 'scheduled',
    internal_notes: null,
    patients: { full_name: 'Marina Costa' },
    professionals: { display_name: 'Dra. Helena' },
    ...overrides,
  }
}

function createClient(options: { exceptions?: unknown[]; businessHours?: unknown } = {}) {
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {}

    const chain = () => (...args: unknown[]) => {
      void args
      return builder
    }

    for (const method of ['select', 'eq', 'gte', 'lt', 'gt', 'neq', 'not', 'order', 'limit', 'insert', 'update']) {
      builder[method] = chain()
    }

    builder.maybeSingle = async () => {
      if (table === 'clinic_settings') {
        return {
          data: { business_hours: 'businessHours' in options ? options.businessHours : storedWeek },
          error: null,
        }
      }
      return { data: null, error: null }
    }

    /*
     * O insert precisa devolver linha: sem ela o repositorio levanta um erro
     * proprio e o teste nao saberia distinguir "passou pela guarda" de
     * "quebrou depois dela".
     */
    builder.single = async () => ({ data: appointmentRow(), error: null })

    builder.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({
        data:
          table === 'availability_exceptions' ? (options.exceptions ?? []) : [],
        error: null,
        count: 0,
      }).then(onFulfilled, onRejected)

    return builder
  })

  return { from } as never
}

/** Quarta-feira, 14:00–15:00 — dentro do expediente da semana acima. */
const start = new Date('2026-08-12T14:00:00.000Z')
const end = new Date('2026-08-12T15:00:00.000Z')

function newAppointment(professionalId: string | null = PROFESSIONAL) {
  return {
    patientId: PATIENT,
    professionalId,
    startsAt: start,
    endsAt: end,
    notes: null,
    roomId: null,
  }
}

async function reasonOfCreate(
  options: Parameters<typeof createClient>[0],
  professionalId: string | null = PROFESSIONAL,
) {
  const subject = new SupabaseAppointmentRepository(createClient(options))
  return subject
    .create(CLINIC, newAppointment(professionalId) as never, USER)
    .then(() => 'sem erro')
    .catch((cause: { reason?: string }) => cause.reason ?? 'erro sem motivo')
}

describe('bloqueio recusa o agendamento', () => {
  it('bloqueio da clínica alcança qualquer profissional', async () => {
    expect(await reasonOfCreate({ exceptions: [exceptionRow()] })).toBe('blocked-window')
  })

  it('bloqueio de um profissional não alcança os outros', async () => {
    /*
     * Férias da Dra. Ana não podem fechar a agenda do Dr. Bruno — seria a
     * clínica inteira parando por causa de uma pessoa.
     */
    const ferias = exceptionRow({ professional_id: OTHER_PROFESSIONAL })

    expect(await reasonOfCreate({ exceptions: [ferias] })).toBe('sem erro')
    expect(await reasonOfCreate({ exceptions: [ferias] }, OTHER_PROFESSIONAL)).toBe('blocked-window')
  })

  it('bloqueio em outra janela não atrapalha', async () => {
    const outroDia = exceptionRow({
      starts_at: '2026-08-20T00:00:00.000Z',
      ends_at: '2026-08-21T00:00:00.000Z',
    })

    expect(await reasonOfCreate({ exceptions: [outroDia] })).toBe('sem erro')
  })

  it('a mensagem cita de quem é a agenda e o motivo', async () => {
    // É a próxima pergunta de quem está com o telefone na mão.
    const subject = new SupabaseAppointmentRepository(
      createClient({
        exceptions: [
          exceptionRow({
            professional_id: PROFESSIONAL,
            professional: { id: PROFESSIONAL, full_name: 'Ana Costa' },
            reason: 'Férias',
          }),
        ],
      }),
    )

    await expect(subject.create(CLINIC, newAppointment() as never, USER)).rejects.toMatchObject({
      userDetail: expect.stringContaining('Ana Costa'),
    })
  })
})

describe('bloqueio não é confirmável', () => {
  it('a confirmação de encaixe NÃO passa por cima do bloqueio', async () => {
    /*
     * `allowOutsideBusinessHours` é a resposta de quem confirmou "agendar mesmo
     * assim" para o horário fora do expediente. Se ela também liberasse
     * bloqueio, o feriado viraria um aviso — e ninguém teria como fechar a
     * agenda de verdade.
     */
    const subject = new SupabaseAppointmentRepository(
      createClient({ exceptions: [exceptionRow()] }),
    )

    await expect(
      subject.create(CLINIC, newAppointment() as never, USER, {
        allowOutsideBusinessHours: true,
      }),
    ).rejects.toMatchObject({ reason: 'blocked-window' })
  })
})

describe('horário extra libera o expediente', () => {
  /** Sábado 19:00–20:00: fechado na semana declarada acima. */
  const saturdayStart = new Date('2026-08-15T19:00:00.000Z')
  const saturdayEnd = new Date('2026-08-15T20:00:00.000Z')

  function saturdayAppointment() {
    return {
      patientId: PATIENT,
      professionalId: PROFESSIONAL,
      startsAt: saturdayStart,
      endsAt: saturdayEnd,
      notes: null,
      roomId: null,
    }
  }

  async function reasonOfSaturday(exceptions: unknown[]) {
    const subject = new SupabaseAppointmentRepository(createClient({ exceptions }))
    return subject
      .create(CLINIC, saturdayAppointment() as never, USER)
      .then(() => 'sem erro')
      .catch((cause: { reason?: string }) => cause.reason ?? 'erro sem motivo')
  }

  it('sem extra, sábado continua fora do expediente', async () => {
    expect(await reasonOfSaturday([])).toBe('outside-business-hours')
  })

  it('extra cobrindo o atendimento inteiro dispensa a pergunta', async () => {
    const mutirao = exceptionRow({
      kind: 'extra',
      starts_at: '2026-08-15T18:00:00.000Z',
      ends_at: '2026-08-15T22:00:00.000Z',
      reason: 'Mutirão',
    })

    expect(await reasonOfSaturday([mutirao])).toBe('sem erro')
  })

  it('cobertura PARCIAL não dispensa', async () => {
    /*
     * Extra das 18h às 19h30 não autoriza atendimento que vai até 20h: a última
     * meia hora continua fora do expediente e sem ninguém previsto para ela.
     */
    const curto = exceptionRow({
      kind: 'extra',
      starts_at: '2026-08-15T18:00:00.000Z',
      ends_at: '2026-08-15T19:30:00.000Z',
    })

    expect(await reasonOfSaturday([curto])).toBe('outside-business-hours')
  })

  it('extra de outro profissional não libera', async () => {
    const deOutro = exceptionRow({
      kind: 'extra',
      professional_id: OTHER_PROFESSIONAL,
      starts_at: '2026-08-15T18:00:00.000Z',
      ends_at: '2026-08-15T22:00:00.000Z',
    })

    expect(await reasonOfSaturday([deOutro])).toBe('outside-business-hours')
  })
})
