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

const PROFESSIONAL = '22222222-2222-4222-8222-222222222222'

/** Semana gravada em `clinic_settings.business_hours`: seg–sex, 08:00 às 18:00. */
const storedWeek = {
  days: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
    weekday,
    closed: weekday > 5,
    opensAt: '08:00',
    closesAt: '18:00',
  })),
}

function createFakeClient(results: {
  row?: unknown
  error?: { code?: string; message?: string } | null
  current?: { status: string } | null
  /** Linhas devolvidas pela consulta de sobreposição (A-02). */
  overlapping?: unknown[]
  /** Conteúdo de `clinic_settings.business_hours`. */
  businessHours?: unknown
  searchPatients?: unknown[]
  searchRows?: unknown[]
  /** Linhas devolvidas pelas consultas de INTERVALO (`gte` + `lt`). */
  rangeRows?: unknown[]
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
    const argsOf = (method: string) =>
      calls.find((call) => call.query === index && call.method === method)?.args

    for (const method of [
      'select',
      'eq',
      'neq',
      'not',
      'lt',
      'gt',
      'gte',
      'limit',
      'ilike',
      'in',
      'order',
      'update',
      'insert',
    ]) {
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
      const selected = argsOf('select')?.[0]

      // Horario de funcionamento (A-02): `'businessHours' in results` e nao
      // `?? {}` — a coluna vazia e um dos casos sob teste.
      if (table === 'clinic_settings') {
        return {
          data: {
            business_hours:
              'businessHours' in results ? results.businessHours : null,
          },
          error: null,
        }
      }

      // A leitura do status ANTERIOR usa `select('status')`; ela vem antes do
      // update no `cancel`.
      if (selected === 'status') {
        return { data: results.current ?? { status: 'confirmed' }, error: null }
      }

      // Leitura do profissional antes de remarcar (A-02). Segue `row`: quando o
      // atendimento e de outra clinica, esta e a consulta que nao o encontra.
      if (selected === 'professional_id') {
        const missing = 'row' in results && results.row === null
        return {
          data: missing ? null : { professional_id: PROFESSIONAL },
          error: null,
        }
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
    ) => {
      /*
       * A sonda de sobreposicao usa `lt('starts_at')` + `gt('ends_at')`.
       *
       * Detectar so por `lt` era ambiguo: as consultas de INTERVALO
       * (`listByRange`, `listByProfessionalRange`) usam `gte` + `lt`, e cairiam
       * aqui devolvendo `overlapping`. Nenhum teste cobria intervalo ate agora,
       * entao a ambiguidade nunca apareceu — exigir os DOIS metodos e o que
       * separa as duas familias.
       */
      const inThisQuery = (method: string) =>
        calls.some((call) => call.query === index && call.method === method)

      const isOverlapProbe = inThisQuery('lt') && inThisQuery('gt')

      const payload = isOverlapProbe
        ? { data: results.overlapping ?? [], error: null }
        : inThisQuery('gte')
        ? { data: results.rangeRows ?? [], error: null }
        : table === 'patients' && calls.some((call) => call.method === 'ilike')
          ? { data: results.searchPatients ?? [], error: null }
          : table === 'appointments' && calls.some((call) => call.method === 'in')
            ? { data: results.searchRows ?? [], error: null }
        : isHistory
          ? { data: null, error: null }
          : { data: [], error: null }

      return Promise.resolve(payload).then(onFulfilled, onRejected)
    }

    return query
  })

  return {
    calls,
    client: { from } as never,
    ofTable: (table: string) => calls.filter((call) => call.table === table),
  }
}

/** Entrada de criação, com o horário podendo ser sobrescrito por teste. */
describe('SupabaseAppointmentRepository.searchByPatientName', () => {
  it('busca pacientes ativos e retorna somente atendimentos da mesma clínica', async () => {
    const fake = createFakeClient({
      searchPatients: [{ id: '11111111-1111-4111-8111-111111111111' }],
      searchRows: [joinRow()],
    })

    const appointments = await new SupabaseAppointmentRepository(
      fake.client,
    ).searchByPatientName(CLINIC, 'Marina', 8)

    expect(appointments[0]).toMatchObject({
      id: APPOINTMENT,
      patientName: 'Marina Costa',
    })
    expect(fake.ofTable('patients')).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
    )
    expect(fake.ofTable('patients')).toContainEqual(
      expect.objectContaining({ method: 'ilike', args: ['full_name', '%Marina%'] }),
    )
    expect(fake.ofTable('appointments')).toContainEqual(
      expect.objectContaining({
        method: 'in',
        args: ['patient_id', ['11111111-1111-4111-8111-111111111111']],
      }),
    )
  })
})

function newAppointment(overrides: Record<string, unknown> = {}) {
  return {
    patientId: '11111111-1111-4111-8111-111111111111',
    professionalId: PROFESSIONAL,
    startsAt: new Date(2026, 7, 10, 13, 0),
    endsAt: new Date(2026, 7, 10, 13, 30),
    reason: 'Consulta de rotina',
    status: 'scheduled' as const,
    notes: null,
    ...overrides,
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

describe('conflito de horário (A-02)', () => {
  it('recusa quando o profissional já tem atendimento no intervalo', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({ overlapping: [{ id: 'outro' }] })

    await expect(
      new SupabaseAppointmentRepository(fake.client).create(
        CLINIC,
        newAppointment(),
        USER,
      ),
    ).rejects.toMatchObject({ reason: 'conflict' })

    // A recusa acontece ANTES da escrita: nada foi gravado.
    expect(
      fake.ofTable('appointments').some((call) => call.method === 'insert'),
    ).toBe(false)

    spy.mockRestore()
  })

  it('usa intervalo SEMIABERTO — 10:00–10:30 e 10:30–11:00 não colidem', async () => {
    const fake = createFakeClient({})

    await new SupabaseAppointmentRepository(fake.client).create(
      CLINIC,
      newAppointment(),
      USER,
    )

    const calls = fake.ofTable('appointments')

    /*
     * `starts_at < novo.ends_at` e `ends_at > novo.starts_at`, os dois estritos.
     * Trocar por `<=`/`>=` faria a agenda de 30 em 30 minutos recusar o horário
     * seguinte — que é como toda recepção trabalha.
     */
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: 'lt',
        args: ['starts_at', new Date(2026, 7, 10, 13, 30).toISOString()],
      }),
    )
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: 'gt',
        args: ['ends_at', new Date(2026, 7, 10, 13, 0).toISOString()],
      }),
    )
  })

  it('cancelado e falta NÃO ocupam horário', async () => {
    const fake = createFakeClient({})

    await new SupabaseAppointmentRepository(fake.client).create(
      CLINIC,
      newAppointment(),
      USER,
    )

    // Remarcar em cima de um cancelado e o caso mais comum de todos: se ele
    // ocupasse, a recepcao teria de inventar outro horario.
    expect(fake.ofTable('appointments')).toContainEqual(
      expect.objectContaining({
        method: 'not',
        args: ['status', 'in', '("canceled","no_show")'],
      }),
    )
  })

  it('remarcar para o mesmo horário não conflita consigo mesmo', async () => {
    const fake = createFakeClient({})

    await new SupabaseAppointmentRepository(fake.client).reschedule(
      CLINIC,
      APPOINTMENT,
      new Date(2026, 7, 10, 14, 0),
      new Date(2026, 7, 10, 14, 45),
    )

    expect(fake.ofTable('appointments')).toContainEqual(
      expect.objectContaining({ method: 'neq', args: ['id', APPOINTMENT] }),
    )
  })
})

describe('horário de funcionamento (A-02)', () => {
  it('recusa fora do expediente, dizendo qual é a janela', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({ businessHours: storedWeek })

    await expect(
      new SupabaseAppointmentRepository(fake.client).create(
        CLINIC,
        // Segunda-feira, 19:00 — a clínica fecha às 18:00.
        newAppointment({
          startsAt: new Date(2026, 7, 10, 19, 0),
          endsAt: new Date(2026, 7, 10, 19, 30),
        }),
        USER,
      ),
    ).rejects.toMatchObject({
      reason: 'outside-business-hours',
      userDetail: expect.stringContaining('08:00'),
    })

    spy.mockRestore()
  })

  it('recusa em dia fechado, nomeando o dia', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({ businessHours: storedWeek })

    await expect(
      new SupabaseAppointmentRepository(fake.client).create(
        CLINIC,
        // 15/08/2026 é um sábado, e `storedWeek` fecha aos sábados.
        newAppointment({
          startsAt: new Date(2026, 7, 15, 10, 0),
          endsAt: new Date(2026, 7, 15, 10, 30),
        }),
        USER,
      ),
    ).rejects.toMatchObject({
      reason: 'outside-business-hours',
      userDetail: expect.stringContaining('Sábado'),
    })

    spy.mockRestore()
  })

  it('clínica que NUNCA configurou horário continua marcando a qualquer hora', async () => {
    // O padrão de tela (seg–sex, 08h–18h) é sugestão. Impô-lo recusaria o
    // domingo de uma clínica que atende domingo e nunca disse o contrário.
    const fake = createFakeClient({ businessHours: {} })

    await new SupabaseAppointmentRepository(fake.client).create(
      CLINIC,
      newAppointment({
        startsAt: new Date(2026, 7, 16, 22, 0),
        endsAt: new Date(2026, 7, 16, 22, 30),
      }),
      USER,
    )

    expect(
      fake.ofTable('appointments').some((call) => call.method === 'insert'),
    ).toBe(true)
  })

  it('confirmado por quem agenda, o encaixe passa', async () => {
    const fake = createFakeClient({ businessHours: storedWeek })

    await new SupabaseAppointmentRepository(fake.client).create(
      CLINIC,
      newAppointment({
        startsAt: new Date(2026, 7, 10, 19, 0),
        endsAt: new Date(2026, 7, 10, 19, 30),
      }),
      USER,
      { allowOutsideBusinessHours: true },
    )

    expect(
      fake.ofTable('appointments').some((call) => call.method === 'insert'),
    ).toBe(true)
    // Confirmado, nem consulta a configuração: a decisão já foi tomada.
    expect(fake.ofTable('clinic_settings')).toHaveLength(0)
  })

  it('configuração indisponível LIBERA, em vez de travar a agenda', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({ businessHours: { seg: '8h às 18h' } })

    // Formato desconhecido não é horário: impor um palpite recusaria
    // agendamento legítimo, e a agenda é o trabalho da clínica.
    await new SupabaseAppointmentRepository(fake.client).create(
      CLINIC,
      newAppointment({
        startsAt: new Date(2026, 7, 10, 23, 0),
        endsAt: new Date(2026, 7, 10, 23, 30),
      }),
      USER,
    )

    expect(
      fake.ofTable('appointments').some((call) => call.method === 'insert'),
    ).toBe(true)

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

/**
 * A agenda de UMA pessoa — o que o Portal do profissional lê.
 *
 * O que estes testes prendem não é o mapeamento (isso o resto do arquivo já
 * cobre): é **onde o filtro acontece**. `listByProfessionalRange` existe
 * separado de `listByRange` porque `professional_id` precisa ir ao banco, e não
 * a um `.filter()` depois. A RLS de `appointments` isola a clínica, não a
 * pessoa: sem esta cláusula, a consulta volta com a agenda dos colegas e só a
 * tela esconde — e esconder no navegador não esconde, porque o payload do RSC
 * continua legível para quem abrir a aba de rede.
 */
describe('listByProfessionalRange', () => {
  const FROM = new Date('2026-08-10T00:00:00.000Z')
  const TO = new Date('2026-08-11T00:00:00.000Z')

  it('filtra por clínica E por profissional, no banco', async () => {
    const fake = createFakeClient({ rangeRows: [] })

    await new SupabaseAppointmentRepository(fake.client).listByProfessionalRange(
      CLINIC,
      PROFESSIONAL,
      FROM,
      TO,
    )

    const chamadas = fake.ofTable('appointments')

    expect(chamadas).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
    )
    expect(chamadas).toContainEqual(
      expect.objectContaining({
        method: 'eq',
        args: ['professional_id', PROFESSIONAL],
      }),
    )
  })

  it('recorta o intervalo com [início, fim)', async () => {
    /*
     * `gte` no começo e `lt` no fim, e não `lte`: o fim do intervalo é a
     * meia-noite do dia seguinte, e `lte` traria o atendimento marcado
     * exatamente às 00:00 de amanhã para o dia de hoje.
     */
    const fake = createFakeClient({ rangeRows: [] })

    await new SupabaseAppointmentRepository(fake.client).listByProfessionalRange(
      CLINIC,
      PROFESSIONAL,
      FROM,
      TO,
    )

    const chamadas = fake.ofTable('appointments')

    expect(chamadas).toContainEqual(
      expect.objectContaining({
        method: 'gte',
        args: ['starts_at', FROM.toISOString()],
      }),
    )
    expect(chamadas).toContainEqual(
      expect.objectContaining({
        method: 'lt',
        args: ['starts_at', TO.toISOString()],
      }),
    )
    expect(chamadas).not.toContainEqual(
      expect.objectContaining({ method: 'lte' }),
    )
  })

  it('pede ao banco a ordem cronológica', async () => {
    const fake = createFakeClient({ rangeRows: [] })

    await new SupabaseAppointmentRepository(fake.client).listByProfessionalRange(
      CLINIC,
      PROFESSIONAL,
      FROM,
      TO,
    )

    expect(fake.ofTable('appointments')).toContainEqual(
      expect.objectContaining({
        method: 'order',
        args: ['starts_at', { ascending: true }],
      }),
    )
  })

  it('mapeia a linha com nome do paciente e do profissional', async () => {
    const fake = createFakeClient({ rangeRows: [joinRow()] })

    const [appointment] = await new SupabaseAppointmentRepository(
      fake.client,
    ).listByProfessionalRange(CLINIC, PROFESSIONAL, FROM, TO)

    expect(appointment.patientName).toBe('Marina Costa')
    expect(appointment.professionalName).toBe('Dra. Helena')
    expect(appointment.durationMinutes).toBe(30)
  })

  it('dia sem nada devolve lista vazia, não erro', async () => {
    const fake = createFakeClient({ rangeRows: [] })

    const rows = await new SupabaseAppointmentRepository(
      fake.client,
    ).listByProfessionalRange(CLINIC, PROFESSIONAL, FROM, TO)

    expect(rows).toEqual([])
  })
})
