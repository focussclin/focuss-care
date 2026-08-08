import { describe, expect, it, vi } from 'vitest'

import { SupabaseAppointmentRepository } from './SupabaseAppointmentRepository'

/**
 * Contrato de escrita da agenda (A-01).
 *
 * O fake grava a cadeia de chamadas do supabase-js em vez de falar com o banco:
 * é o único jeito de afirmar que `clinic_id` está em toda escrita e que cancelar
 * não apaga. **Nenhuma chamada de rede.** Tenancy real continua sendo pgTAP (R1).
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const APPOINTMENT = '9019956f-bdd8-4d61-868d-09b02332dad0'

interface RecordedCall {
  query: number
  table: string
  method: string
  args: unknown[]
}

function joinRow(overrides: Record<string, unknown> = {}) {
  return {
    id: APPOINTMENT,
    patient_id: '11111111-1111-4111-8111-111111111111',
    professional_id: '22222222-2222-4222-8222-222222222222',
    reason: 'Consulta de rotina',
    starts_at: '2026-08-10T13:00:00.000Z',
    ends_at: '2026-08-10T13:30:00.000Z',
    status: 'scheduled',
    internal_notes: null,
    patients: { full_name: 'Marina Costa' },
    professionals: { display_name: 'Dra. Helena' },
    ...overrides,
  }
}

function createFakeClient(results: {
  row?: unknown
  error?: { code?: string; message?: string } | null
  current?: { status: string } | null
}) {
  const calls: RecordedCall[] = []
  let queryIndex = -1

  const from = vi.fn((table: string) => {
    queryIndex += 1
    const index = queryIndex
    let isHistory = false

    const record = (method: string, args: unknown[]) => {
      calls.push({ query: index, table, method, args })
    }

    const query: Record<string, unknown> = {}

    for (const method of ['select', 'eq', 'neq', 'not', 'update', 'insert']) {
      query[method] = (...args: unknown[]) => {
        record(method, args)
        if (method === 'insert' && table === 'appointment_status_history') {
          isHistory = true
        }
        return query
      }
    }

    query.single = async () => {
      record('single', [])
      // `'row' in results` e nao `?? joinRow()`: o caso de linha ausente
      // (outra clinica) e justamente o que interessa, e `null ??` o apagaria.
      return {
        data: 'row' in results ? results.row : joinRow(),
        error: results.error ?? null,
      }
    }

    query.maybeSingle = async () => {
      record('maybeSingle', [])
      // A leitura do status ANTERIOR usa `select('status')`; ela vem antes do
      // update no `cancel`.
      const isStatusProbe = calls.some(
        (call) =>
          call.query === index &&
          call.method === 'select' &&
          call.args[0] === 'status',
      )

      if (isStatusProbe) {
        return { data: results.current ?? { status: 'confirmed' }, error: null }
      }

      // `'row' in results` e nao `?? joinRow()`: o caso de linha ausente
      // (outra clinica) e justamente o que interessa, e `null ??` o apagaria.
      return {
        data: 'row' in results ? results.row : joinRow(),
        error: results.error ?? null,
      }
    }

    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve(
        isHistory ? { data: null, error: null } : { data: [], error: null },
      ).then(onFulfilled, onRejected)

    return query
  })

  return {
    calls,
    client: { from } as never,
    ofTable: (table: string) => calls.filter((call) => call.table === table),
  }
}

describe('SupabaseAppointmentRepository.create', () => {
  it('grava com a clínica e o autor do contexto, nunca do formulário', async () => {
    const fake = createFakeClient({})

    await new SupabaseAppointmentRepository(fake.client).create(
      CLINIC,
      {
        patientId: '11111111-1111-4111-8111-111111111111',
        professionalId: '22222222-2222-4222-8222-222222222222',
        startsAt: new Date('2026-08-10T13:00:00.000Z'),
        endsAt: new Date('2026-08-10T13:30:00.000Z'),
        reason: 'Consulta de rotina',
        status: 'scheduled',
        notes: null,
      },
      USER,
    )

    const insert = fake
      .ofTable('appointments')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    expect(insert.clinic_id).toBe(CLINIC)
    expect(insert.created_by).toBe(USER)
    // Agendamento tem hora marcada; encaixe sem hora e fila de espera (E-01).
    expect(insert.is_walk_in).toBe(false)
  })

  it('registra a entrada no histórico de status', async () => {
    const fake = createFakeClient({})

    await new SupabaseAppointmentRepository(fake.client).create(
      CLINIC,
      {
        patientId: '11111111-1111-4111-8111-111111111111',
        professionalId: '22222222-2222-4222-8222-222222222222',
        startsAt: new Date('2026-08-10T13:00:00.000Z'),
        endsAt: new Date('2026-08-10T13:30:00.000Z'),
        reason: 'Retorno',
        status: 'confirmed',
        notes: null,
      },
      USER,
    )

    const history = fake
      .ofTable('appointment_status_history')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    expect(history.clinic_id).toBe(CLINIC)
    expect(history.from_status).toBeNull()
    expect(history.to_status).toBe('confirmed')
    expect(history.changed_by).toBe(USER)
    // `changed_at` nao tem default no schema remoto: se sumir daqui, o insert
    // passa a ser recusado pelo banco.
    expect(history.changed_at).toBeTypeOf('string')
  })

  it('traduz violação de exclusão em conflito de horário', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({
      error: { code: '23P01', message: 'conflicting key value' },
    })

    await expect(
      new SupabaseAppointmentRepository(fake.client).create(
        CLINIC,
        {
          patientId: '11111111-1111-4111-8111-111111111111',
          professionalId: '22222222-2222-4222-8222-222222222222',
          startsAt: new Date('2026-08-10T13:00:00.000Z'),
          endsAt: new Date('2026-08-10T13:30:00.000Z'),
          reason: 'Consulta',
          status: 'scheduled',
          notes: null,
        },
        USER,
      ),
    ).rejects.toMatchObject({ reason: 'conflict' })

    spy.mockRestore()
  })
})

describe('SupabaseAppointmentRepository.reschedule', () => {
  it('move o horário sem tocar no status', async () => {
    const fake = createFakeClient({})

    await new SupabaseAppointmentRepository(fake.client).reschedule(
      CLINIC,
      APPOINTMENT,
      new Date('2026-08-11T14:00:00.000Z'),
      new Date('2026-08-11T14:45:00.000Z'),
    )

    const update = fake
      .ofTable('appointments')
      .find((call) => call.method === 'update')?.args[0] as Record<
      string,
      unknown
    >

    // Confirmado que muda de hora continua confirmado: zerar a confirmacao
    // faria a recepcao ligar de novo para quem ja tinha confirmado.
    expect(update).not.toHaveProperty('status')
    expect(update.starts_at).toBe('2026-08-11T14:00:00.000Z')
  })

  it('filtra a clínica e recusa remarcar o que foi cancelado', async () => {
    const fake = createFakeClient({})

    await new SupabaseAppointmentRepository(fake.client).reschedule(
      CLINIC,
      APPOINTMENT,
      new Date('2026-08-11T14:00:00.000Z'),
      new Date('2026-08-11T14:45:00.000Z'),
    )

    const calls = fake.ofTable('appointments')

    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
    )
    // Remarcar um cancelado seria ressuscita-lo pela porta dos fundos.
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: 'not',
        args: ['status', 'in', '("canceled","no_show")'],
      }),
    )
  })

  it('linha de outra clínica vira not-found, não sucesso silencioso', async () => {
    const fake = createFakeClient({ row: null })

    await expect(
      new SupabaseAppointmentRepository(fake.client).reschedule(
        CLINIC,
        APPOINTMENT,
        new Date('2026-08-11T14:00:00.000Z'),
        new Date('2026-08-11T14:45:00.000Z'),
      ),
    ).rejects.toMatchObject({ reason: 'not-found' })
  })
})

describe('SupabaseAppointmentRepository.cancel', () => {
  it('cancela SEM apagar, guardando quando e por quê', async () => {
    const fake = createFakeClient({
      row: joinRow({ status: 'canceled' }),
      current: { status: 'confirmed' },
    })

    await new SupabaseAppointmentRepository(fake.client).cancel(
      CLINIC,
      APPOINTMENT,
      'paciente remarcou por telefone',
      USER,
    )

    const calls = fake.ofTable('appointments')

    // O §8 do roadmap proibe DELETE. Agenda de saude e registro do que foi
    // combinado, inclusive do que foi desmarcado.
    expect(calls.some((call) => call.method === 'delete')).toBe(false)

    const update = calls.find((call) => call.method === 'update')
      ?.args[0] as Record<string, unknown>

    expect(update.status).toBe('canceled')
    expect(update.cancel_reason).toBe('paciente remarcou por telefone')
    expect(update.canceled_at).toBeTypeOf('string')
  })

  it('guarda o status ANTERIOR no histórico', async () => {
    const fake = createFakeClient({
      row: joinRow({ status: 'canceled' }),
      current: { status: 'confirmed' },
    })

    await new SupabaseAppointmentRepository(fake.client).cancel(
      CLINIC,
      APPOINTMENT,
      null,
      USER,
    )

    const history = fake
      .ofTable('appointment_status_history')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    // Lido ANTES do update: depois dele a informacao some, e e ela que diz de
    // onde a linha veio.
    expect(history.from_status).toBe('confirmed')
    expect(history.to_status).toBe('canceled')
  })

  it('não cancela duas vezes', async () => {
    const fake = createFakeClient({})

    await new SupabaseAppointmentRepository(fake.client).cancel(
      CLINIC,
      APPOINTMENT,
      null,
      USER,
    )

    expect(fake.ofTable('appointments')).toContainEqual(
      expect.objectContaining({ method: 'neq', args: ['status', 'canceled'] }),
    )
  })
})
