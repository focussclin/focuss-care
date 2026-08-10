import { describe, expect, it, vi } from 'vitest'

import { isAppointmentRepositoryError } from '../domain/AppointmentRepositoryError'
import { SupabaseAppointmentRepository } from './SupabaseAppointmentRepository'

/**
 * O vínculo da agenda com a sala — e a promessa de não quebrar quem não a usa.
 *
 * Arquivo separado de `SupabaseAppointmentRepository.test.ts` de propósito: o
 * fake de lá é grande, com ramos para sobreposição, horário de funcionamento e
 * busca. Aqui o que se observa é uma coisa só — **o que atravessa o fio** —, e
 * um fake mínimo torna isso legível.
 *
 * # A propriedade que importa
 *
 * `20260809_rooms.sql` NÃO foi aplicada, então `appointments.room_id` não
 * existe no banco. Citar uma coluna inexistente faz o PostgREST recusar a
 * consulta **inteira** — ou seja, um `room_id: null` no payload derrubaria toda
 * marcação de consulta de toda clínica, por causa de um campo que ninguém
 * preencheu.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const ROOM = '33333333-3333-4333-8333-333333333333'

interface RecordedCall {
  method: string
  args: unknown[]
}

function joinRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '9019956f-bdd8-4d61-868d-09b02332dad0',
    patient_id: '11111111-1111-4111-8111-111111111111',
    professional_id: '22222222-2222-4222-8222-222222222222',
    reason: 'Consulta',
    starts_at: '2026-08-20T12:00:00.000Z',
    ends_at: '2026-08-20T12:30:00.000Z',
    status: 'scheduled',
    internal_notes: null,
    patients: { full_name: 'Ana Souza' },
    professionals: { display_name: 'Dra. Marina' },
    ...overrides,
  }
}

/**
 * Fake mínimo.
 *
 * `businessHours` devolve a semana aberta para que a verificação de expediente
 * não interfira: o que se observa aqui é a sala.
 */
function createFakeClient(
  options: { rows?: unknown[]; row?: unknown; error?: { code?: string; message?: string } } = {},
) {
  const calls: RecordedCall[] = []
  const query: Record<string, unknown> = {}

  for (const method of [
    'select', 'eq', 'neq', 'not', 'lt', 'gt', 'gte', 'in', 'ilike', 'limit',
    'order', 'insert', 'update',
  ]) {
    query[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return query
    }
  }

  const selectedColumns = () =>
    String(calls.find((call) => call.method === 'select')?.args[0] ?? '')

  query.single = async () => ({
    data: options.error ? null : ('row' in options ? options.row : joinRow()),
    error: options.error ?? null,
  })

  query.maybeSingle = async () => {
    // Semana toda aberta: o expediente nao e o assunto deste arquivo.
    if (selectedColumns().includes('business_hours')) {
      return {
        data: {
          business_hours: {
            days: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
              weekday,
              closed: false,
              opensAt: '00:00',
              closesAt: '23:59',
            })),
          },
        },
        error: null,
      }
    }

    return {
      data: options.error ? null : ('row' in options ? options.row : joinRow()),
      error: options.error ?? null,
    }
  }

  query.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) =>
    // Sem sobreposicao: a lista vazia responde a sonda de conflito.
    Promise.resolve({ data: options.rows ?? [], error: null }).then(
      onFulfilled,
      onRejected,
    )

  return { calls, client: { from: vi.fn(() => query) } as never }
}

function subject(options: Parameters<typeof createFakeClient>[0] = {}) {
  const fake = createFakeClient(options)
  return { fake, repository: new SupabaseAppointmentRepository(fake.client) }
}

const newAppointment = (roomId?: string | null) => ({
  patientId: '11111111-1111-4111-8111-111111111111',
  professionalId: '22222222-2222-4222-8222-222222222222',
  startsAt: new Date('2026-08-20T12:00:00.000Z'),
  endsAt: new Date('2026-08-20T12:30:00.000Z'),
  reason: 'Consulta',
  status: 'scheduled' as const,
  notes: null,
  ...(roomId === undefined ? {} : { roomId }),
})

function insertPayload(calls: RecordedCall[]): Record<string, unknown> {
  const insert = calls.find(
    (call) =>
      call.method === 'insert' &&
      typeof call.args[0] === 'object' &&
      call.args[0] !== null &&
      'patient_id' in (call.args[0] as object),
  )

  return insert?.args[0] as Record<string, unknown>
}

describe('escrita sem sala', () => {
  it('não cita room_id no insert quando não há sala', async () => {
    /*
     * O teste que protege todo o resto. Enquanto a migration não for aplicada,
     * um `room_id` no payload — mesmo nulo — faz o PostgREST recusar o insert
     * por coluna inexistente, e marcar consulta para de funcionar.
     */
    const { fake, repository } = subject()

    await repository.create(CLINIC, newAppointment(), USER)

    expect(insertPayload(fake.calls)).not.toHaveProperty('room_id')
  })

  it('roomId nulo também não cita a coluna', async () => {
    const { fake, repository } = subject()

    await repository.create(CLINIC, newAppointment(null), USER)

    expect(insertPayload(fake.calls)).not.toHaveProperty('room_id')
  })

  it('não pede room_id no select quando não há sala', async () => {
    const { fake, repository } = subject()

    await repository.create(CLINIC, newAppointment(null), USER)

    const selects = fake.calls
      .filter((call) => call.method === 'select')
      .map((call) => String(call.args[0]))

    expect(selects.every((columns) => !columns.includes('room_id'))).toBe(true)
  })
})

describe('escrita com sala', () => {
  it('grava room_id quando a sala foi escolhida', async () => {
    const { fake, repository } = subject()

    await repository.create(CLINIC, newAppointment(ROOM), USER)

    expect(insertPayload(fake.calls).room_id).toBe(ROOM)
  })

  it('o resto do payload não muda por causa da sala', async () => {
    // A sala é aditiva: quem já marcava continua marcando igual.
    const { fake, repository } = subject()

    await repository.create(CLINIC, newAppointment(ROOM), USER)

    expect(insertPayload(fake.calls)).toMatchObject({
      clinic_id: CLINIC,
      created_by: USER,
      is_walk_in: false,
    })
  })
})

describe('leitura', () => {
  it('sem withRoom, o select não menciona a sala', async () => {
    /*
     * O padrão. `listByRange` roda em toda abertura da agenda, e enquanto a
     * coluna não existir pedi-la derrubaria a tela inteira.
     */
    const { fake, repository } = subject({ rows: [] })

    await repository.listByRange(
      CLINIC,
      new Date('2026-08-01'),
      new Date('2026-09-01'),
    )

    expect(String(fake.calls[0].args[0])).not.toContain('room_id')
  })

  it('com withRoom, pede room_id e o nome da sala', async () => {
    const { fake, repository } = subject({ rows: [] })

    await repository.listByRange(
      CLINIC,
      new Date('2026-08-01'),
      new Date('2026-09-01'),
      { withRoom: true },
    )

    const columns = String(fake.calls[0].args[0])

    expect(columns).toContain('room_id')
    expect(columns).toContain('rooms ( name )')
  })

  it('mapeia a sala quando ela veio', async () => {
    const { repository } = subject({
      rows: [joinRow({ room_id: ROOM, rooms: { name: 'Consultório 1' } })],
    })

    const [appointment] = await repository.listByRange(
      CLINIC,
      new Date('2026-08-01'),
      new Date('2026-09-01'),
      { withRoom: true },
    )

    expect(appointment.roomId).toBe(ROOM)
    expect(appointment.roomName).toBe('Consultório 1')
  })

  it('atendimento antigo, sem sala, continua válido', async () => {
    /*
     * A linha existe desde antes da coluna. `room_id` nulo não é defeito nem
     * dado faltando — é a maioria dos atendimentos do produto.
     */
    const { repository } = subject({ rows: [joinRow()] })

    const [appointment] = await repository.listByRange(
      CLINIC,
      new Date('2026-08-01'),
      new Date('2026-09-01'),
      { withRoom: true },
    )

    expect(appointment.roomId).toBeNull()
    expect(appointment.roomName).toBeNull()
    expect(appointment.patientName).toBe('Ana Souza')
  })
})

describe('conflito de sala', () => {
  it('23P01 da constraint de SALA vira room-conflict', async () => {
    /*
     * Distinto de `conflict` porque a ação que resolve é outra: conflito de
     * profissional manda mudar o horário; sala ocupada se resolve trocando de
     * sala, e o horário continua bom.
     */
    const { repository } = subject({
      error: {
        code: '23P01',
        message:
          'conflicting key value violates exclusion constraint "appointments_room_no_overlap"',
      },
    })

    await expect(
      repository.create(CLINIC, newAppointment(ROOM), USER),
    ).rejects.toSatisfy(
      (cause: unknown) =>
        isAppointmentRepositoryError(cause) && cause.reason === 'room-conflict',
    )
  })

  it('23P01 do PROFISSIONAL continua conflict', async () => {
    const { repository } = subject({
      error: {
        code: '23P01',
        message:
          'conflicting key value violates exclusion constraint "appointments_no_overlap"',
      },
    })

    await expect(
      repository.create(CLINIC, newAppointment(), USER),
    ).rejects.toSatisfy(
      (cause: unknown) =>
        isAppointmentRepositoryError(cause) && cause.reason === 'conflict',
    )
  })

  it('23P01 sem nome de constraint cai no conflito genérico', async () => {
    // Driver diferente, versão futura: a resposta mais antiga e ainda correta.
    const { repository } = subject({ error: { code: '23P01', message: '' } })

    await expect(
      repository.create(CLINIC, newAppointment(), USER),
    ).rejects.toSatisfy(
      (cause: unknown) =>
        isAppointmentRepositoryError(cause) && cause.reason === 'conflict',
    )
  })
})
