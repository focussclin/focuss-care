import { describe, expect, it, vi } from 'vitest'

import { SupabaseReportingRepository } from './SupabaseReportingRepository'

/**
 * Contrato dos indicadores (T-01).
 *
 * O que este arquivo protege é a diferença entre um número errado e um número
 * ausente. Painel de gestão é lido para decidir — contratar, mudar horário,
 * cobrar a equipe — e ali "0%" e "não há base para calcular" levam a decisões
 * opostas.
 *
 * Sem banco e sem rede. Tenancy real continua sendo pgTAP (R1).
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'

interface RecordedCall {
  table: string
  method: string
  args: unknown[]
}

interface FakeOptions {
  /** Resposta das contagens (`head: true`), por tabela e filtros aplicados. */
  count?: (table: string, calls: readonly RecordedCall[]) => number
  /** Linhas devolvidas pelas consultas que trazem dados. */
  rows?: (table: string, calls: readonly RecordedCall[]) => unknown[]
}

function createFakeClient(options: FakeOptions) {
  const calls: RecordedCall[] = []

  const from = vi.fn((table: string) => {
    const own: RecordedCall[] = []
    let isHeadCount = false

    const query: Record<string, unknown> = {}

    for (const method of [
      'select',
      'eq',
      'neq',
      'gte',
      'lt',
      'not',
      'is',
      'in',
      'order',
      'limit',
    ]) {
      query[method] = (...args: unknown[]) => {
        const call = { table, method, args }
        calls.push(call)
        own.push(call)

        if (method === 'select') {
          const config = args[1] as { head?: boolean } | undefined
          if (config?.head) isHeadCount = true
        }

        return query
      }
    }

    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      const payload = isHeadCount
        ? { data: null, count: options.count?.(table, own) ?? 0, error: null }
        : { data: options.rows?.(table, own) ?? [], count: null, error: null }

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

/** Um filtro `eq` específico foi aplicado nesta consulta? */
function hasEq(calls: readonly RecordedCall[], field: string, value: unknown) {
  return calls.some(
    (call) =>
      call.method === 'eq' && call.args[0] === field && call.args[1] === value,
  )
}

function appointmentRow(
  status: string,
  professionalId = 'prof-1',
  name = 'Dra. Ana',
) {
  return {
    professional_id: professionalId,
    status,
    professionals: { display_name: name },
  }
}

describe('periodReport', () => {
  const from = new Date(2026, 7, 1)
  const to = new Date(2026, 7, 13)

  it('classifica cada atendimento em um desfecho só', async () => {
    const fake = createFakeClient({
      rows: (table) =>
        table === 'appointments'
          ? [
              appointmentRow('completed'),
              appointmentRow('completed'),
              appointmentRow('canceled'),
              appointmentRow('no_show'),
              appointmentRow('scheduled'),
              appointmentRow('in_progress'),
            ]
          : [],
    })

    const report = await new SupabaseReportingRepository(
      fake.client,
    ).periodReport(CLINIC, from, to)

    expect(report.appointments).toEqual({
      total: 6,
      upcoming: 2,
      completed: 2,
      canceled: 1,
      noShow: 1,
    })
  })

  it('cancelado NÃO conta como carga de trabalho do profissional', async () => {
    const fake = createFakeClient({
      rows: (table) =>
        table === 'appointments'
          ? [
              appointmentRow('completed', 'prof-1', 'Dra. Ana'),
              appointmentRow('canceled', 'prof-1', 'Dra. Ana'),
              appointmentRow('completed', 'prof-2', 'Dr. Paulo'),
              appointmentRow('no_show', 'prof-2', 'Dr. Paulo'),
            ]
          : [],
    })

    const report = await new SupabaseReportingRepository(
      fake.client,
    ).periodReport(CLINIC, from, to)

    // Contar o cancelado diria que a profissional atendeu alguem que nao veio.
    expect(report.byProfessional).toEqual([
      { professionalId: 'prof-2', name: 'Dr. Paulo', total: 2 },
      { professionalId: 'prof-1', name: 'Dra. Ana', total: 1 },
    ])
  })

  it('sem desfecho registrado, o comparecimento é NULL — não 0%', async () => {
    const fake = createFakeClient({
      rows: (table) =>
        table === 'appointments' ? [appointmentRow('scheduled')] : [],
    })

    const report = await new SupabaseReportingRepository(
      fake.client,
    ).periodReport(CLINIC, from, to)

    // 0% diria que ninguem compareceu. Numa clinica que ainda nao fechou
    // atendimento nenhum, isso e uma acusacao falsa.
    expect(report.attendance).toBeNull()
  })

  it('avisa quando o período não coube na leitura', async () => {
    const fake = createFakeClient({
      rows: (table) =>
        table === 'appointments'
          ? Array.from({ length: 5000 }, () => appointmentRow('completed'))
          : [],
    })

    const report = await new SupabaseReportingRepository(
      fake.client,
    ).periodReport(CLINIC, from, to)

    // Relatorio truncado em silencio e a pior forma de erro num painel: o
    // numero parece completo e a decisao e tomada em cima dele.
    expect(report.truncated).toBe(true)
  })

  it('filtra sempre pela clínica ativa', async () => {
    const fake = createFakeClient({})

    await new SupabaseReportingRepository(fake.client).periodReport(
      CLINIC,
      from,
      to,
    )

    for (const table of ['appointments', 'patients']) {
      expect(fake.ofTable(table)).toContainEqual(
        expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
      )
    }
  })
})

describe('dailySnapshot', () => {
  const day = new Date(2026, 7, 12, 9, 0)

  it('cancelado não conta como atendimento de hoje', async () => {
    const fake = createFakeClient({ count: () => 3 })

    await new SupabaseReportingRepository(fake.client).dailySnapshot(
      CLINIC,
      day,
    )

    // Um cancelado nao e atendimento: e um horario que voltou a ficar livre.
    expect(fake.ofTable('appointments')).toContainEqual(
      expect.objectContaining({
        method: 'not',
        args: ['status', 'in', '("canceled")'],
      }),
    )
  })

  it('a fila conta só quem chegou hoje', async () => {
    const fake = createFakeClient({ count: () => 1 })

    await new SupabaseReportingRepository(fake.client).dailySnapshot(
      CLINIC,
      day,
    )

    const queue = fake.ofTable('waiting_queue')

    expect(queue).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['status', 'waiting'] }),
    )
    // Sem o corte por data, alguem esquecido na fila de ontem apareceria como
    // paciente esperando AGORA.
    expect(queue).toContainEqual(
      expect.objectContaining({
        method: 'gte',
        args: ['arrived_at', new Date(2026, 7, 12).toISOString()],
      }),
    )
  })

  it('compara novos pacientes com o mês anterior', async () => {
    const fake = createFakeClient({
      count: (table, calls) => {
        if (table !== 'patients') return 0
        const gte = calls.find((call) => call.method === 'gte')?.args[1]
        return gte === new Date(2026, 7, 1).toISOString() ? 10 : 4
      },
    })

    const snapshot = await new SupabaseReportingRepository(
      fake.client,
    ).dailySnapshot(CLINIC, day)

    expect(snapshot.newPatientsThisMonth).toBe(10)
    expect(snapshot.newPatientsPreviousMonth).toBe(4)
  })

  it('calcula o comparecimento a partir de realizados e faltas', async () => {
    const fake = createFakeClient({
      count: (table, calls) => {
        if (table !== 'appointments') return 0
        if (hasEq(calls, 'status', 'completed')) return 9
        if (hasEq(calls, 'status', 'no_show')) return 1
        return 0
      },
    })

    const snapshot = await new SupabaseReportingRepository(
      fake.client,
    ).dailySnapshot(CLINIC, day)

    expect(snapshot.attendance).toEqual({
      completed: 9,
      noShow: 1,
      percentage: 90,
    })
  })
})

describe('recentActivity', () => {
  it('junta as três origens em ordem, e NUNCA cita o paciente', async () => {
    const fake = createFakeClient({
      rows: (table) => {
        if (table === 'appointments') {
          return [
            { id: 'a1', created_by: 'u1', created_at: '2026-08-12T10:00:00Z' },
          ]
        }
        if (table === 'patients') {
          return [
            { id: 'p1', created_by: 'u2', created_at: '2026-08-12T12:00:00Z' },
          ]
        }
        if (table === 'encounters') {
          return [
            { id: 'e1', created_by: 'u1', ended_at: '2026-08-12T11:00:00Z' },
          ]
        }
        return [
          { id: 'u1', full_name: 'Ana Ribeiro' },
          { id: 'u2', full_name: 'Paulo Freitas' },
        ]
      },
    })

    const entries = await new SupabaseReportingRepository(
      fake.client,
    ).recentActivity(CLINIC, 5)

    expect(entries.map((entry) => entry.actorName)).toEqual([
      'Paulo Freitas',
      'Ana Ribeiro',
      'Ana Ribeiro',
    ])

    /*
     * O painel não tem recorte por papel — o financeiro o vê igual ao
     * recepcionista. "Encerrou o atendimento de Fulano" diria a todos quem foi
     * atendido e quando, e isso é informação de saúde.
     */
    for (const entry of entries) {
      expect([
        'agendou um atendimento.',
        'cadastrou um paciente.',
        'encerrou um atendimento.',
      ]).toContain(entry.description)
    }
  })

  it('autor desconhecido não vira linha em branco', async () => {
    const fake = createFakeClient({
      rows: (table) =>
        table === 'appointments'
          ? [{ id: 'a1', created_by: null, created_at: '2026-08-12T10:00:00Z' }]
          : [],
    })

    const entries = await new SupabaseReportingRepository(
      fake.client,
    ).recentActivity(CLINIC, 5)

    // `created_by` e nullable: linha criada por processo ou por conta apagada
    // continua sendo atividade real da clinica.
    expect(entries[0]?.actorName).toBe('Alguém da equipe')
  })

  it('só traz atendimentos ENCERRADOS', async () => {
    const fake = createFakeClient({})

    await new SupabaseReportingRepository(fake.client).recentActivity(CLINIC, 5)

    expect(fake.ofTable('encounters')).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['status', 'closed'] }),
    )
  })
})

// ---------------------------------------------------------------------------

describe('série mensal', () => {
  /**
   * A série é a base da tela de indicadores, e o erro que ela pode cometer é
   * silencioso: janela de mês trocada desloca a curva inteira e ninguém
   * percebe, porque o gráfico continua bonito.
   */
  const REFERENCE = new Date(2026, 7, 8) // 08/08/2026, hora local

  it('devolve um ponto por mês pedido, do mais antigo ao mais recente', async () => {
    const fake = createFakeClient({ count: () => 3 })
    const repository = new SupabaseReportingRepository(fake.client)

    const trend = await repository.monthlyTrend(CLINIC, REFERENCE, 12)

    expect(trend.points).toHaveLength(12)

    const months = trend.points.map((point) => point.month.getTime())
    expect([...months].sort((a, b) => a - b)).toEqual(months)
  })

  it('termina no mês da referência, e não no mês seguinte', async () => {
    const fake = createFakeClient({ count: () => 0 })
    const repository = new SupabaseReportingRepository(fake.client)

    const trend = await repository.monthlyTrend(CLINIC, REFERENCE, 3)
    const last = trend.points.at(-1)?.month

    expect(last?.getFullYear()).toBe(2026)
    expect(last?.getMonth()).toBe(7)
    expect(last?.getDate()).toBe(1)
  })

  it('atravessa a virada do ano sem pular mês', async () => {
    const fake = createFakeClient({ count: () => 0 })
    const repository = new SupabaseReportingRepository(fake.client)

    const trend = await repository.monthlyTrend(CLINIC, new Date(2026, 1, 15), 4)

    expect(
      trend.points.map((point) => [point.month.getFullYear(), point.month.getMonth()]),
    ).toEqual([
      [2025, 10],
      [2025, 11],
      [2026, 0],
      [2026, 1],
    ])
  })

  it('filtra a clínica em TODA contagem — a RLS é a última linha, não a única', async () => {
    const fake = createFakeClient({ count: () => 1 })
    const repository = new SupabaseReportingRepository(fake.client)

    await repository.monthlyTrend(CLINIC, REFERENCE, 6)

    const selects = fake.calls.filter((call) => call.method === 'select')
    expect(selects.length).toBeGreaterThan(0)

    const semTenant = fake.calls.filter(
      (call) => call.method === 'eq' && call.args[0] === 'clinic_id',
    )
    // Três contagens por mês, seis meses.
    expect(semTenant).toHaveLength(18)
    expect(semTenant.every((call) => call.args[1] === CLINIC)).toBe(true)
  })

  it('conta sem transferir linha — `head` em todas as consultas', async () => {
    const fake = createFakeClient({ count: () => 2 })
    const repository = new SupabaseReportingRepository(fake.client)

    await repository.monthlyTrend(CLINIC, REFERENCE, 3)

    const selects = fake.calls.filter((call) => call.method === 'select')
    expect(
      selects.every(
        (call) => (call.args[1] as { head?: boolean } | undefined)?.head === true,
      ),
    ).toBe(true)
  })

  it('exclui cancelado do total e usa `completed` para realizados', async () => {
    const fake = createFakeClient({ count: () => 5 })
    const repository = new SupabaseReportingRepository(fake.client)

    await repository.monthlyTrend(CLINIC, REFERENCE, 1)

    const appointments = fake.ofTable('appointments')
    const excluiCancelado = appointments.some(
      (call) => call.method === 'not' && call.args[0] === 'status',
    )
    const filtraRealizado = appointments.some(
      (call) =>
        call.method === 'eq' &&
        call.args[0] === 'status' &&
        call.args[1] === 'completed',
    )

    expect(excluiCancelado).toBe(true)
    expect(filtraRealizado).toBe(true)
  })

  it('ignora paciente removido na contagem de novos', async () => {
    const fake = createFakeClient({ count: () => 4 })
    const repository = new SupabaseReportingRepository(fake.client)

    await repository.monthlyTrend(CLINIC, REFERENCE, 1)

    expect(
      fake
        .ofTable('patients')
        .some((call) => call.method === 'is' && call.args[0] === 'deleted_at'),
    ).toBe(true)
  })
})

/**
 * Tempos da fila — feature **T-02**.
 *
 * `waiting_queue` guarda os quatro carimbos desde E-01 e nenhum relatório os
 * lia. O que se prova aqui é o recorte da consulta: qual janela, qual clínica e
 * quais colunas — em especial as que NÃO saem do banco.
 */
describe('tempos da fila', () => {
  const from = new Date(2026, 7, 1)
  const to = new Date(2026, 7, 13)

  function queueRow(overrides: Record<string, unknown> = {}) {
    return {
      arrived_at: '2026-08-11T13:00:00.000Z',
      called_at: '2026-08-11T13:10:00.000Z',
      started_at: '2026-08-11T13:12:00.000Z',
      finished_at: '2026-08-11T13:42:00.000Z',
      ...overrides,
    }
  }

  it('a janela é a CHEGADA, e não o horário marcado', async () => {
    /*
     * `arrived_at` existe em toda passagem; `appointment_id` e nulo no encaixe.
     * Ancorar no agendamento deixaria de fora justamente quem chegou sem hora
     * marcada — que e parte da espera real da sala.
     */
    const fake = createFakeClient({
      rows: (table) => (table === 'waiting_queue' ? [queueRow()] : []),
    })

    await new SupabaseReportingRepository(fake.client).periodReport(
      CLINIC,
      from,
      to,
    )

    const queue = fake.calls.filter((call) => call.table === 'waiting_queue')

    expect(queue).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
    )
    expect(queue).toContainEqual(
      expect.objectContaining({
        method: 'gte',
        args: ['arrived_at', from.toISOString()],
      }),
    )
    expect(queue).toContainEqual(
      expect.objectContaining({
        method: 'lt',
        args: ['arrived_at', to.toISOString()],
      }),
    )
  })

  it('não lê o motivo declarado na chegada', async () => {
    /*
     * `reason` e texto livre que, numa recepcao, costuma ser a queixa. O
     * relatorio nao precisa dele para medir tempo, e traze-lo poria conteudo
     * clinico num payload lido por `report.read` — que `finance` tem e
     * `record.read` nao.
     */
    const fake = createFakeClient({
      rows: (table) => (table === 'waiting_queue' ? [queueRow()] : []),
    })

    await new SupabaseReportingRepository(fake.client).periodReport(
      CLINIC,
      from,
      to,
    )

    const columns = fake.calls
      .filter((call) => call.table === 'waiting_queue' && call.method === 'select')
      .map((call) => call.args[0] as string)

    expect(columns.length).toBeGreaterThan(0)
    for (const selected of columns) {
      expect(selected).not.toContain('reason')
      expect(selected).not.toContain('patient_id')
      expect(selected).toContain('arrived_at')
    }
  })

  it('o relatório traz os tempos agregados do período', async () => {
    const fake = createFakeClient({
      rows: (table) =>
        table === 'waiting_queue'
          ? [
              queueRow(),
              queueRow({ called_at: '2026-08-11T13:30:00.000Z' }),
              // Ainda na sala de espera: fica fora da mediana.
              queueRow({ called_at: null, started_at: null, finished_at: null }),
            ]
          : [],
    })

    const report = await new SupabaseReportingRepository(
      fake.client,
    ).periodReport(CLINIC, from, to)

    expect(report.queueTimes.waiting).toEqual({
      sample: 2,
      medianMinutes: 20,
      maxMinutes: 30,
    })
    expect(report.queueTimes.stillWaiting).toBe(1)
  })

  it('período sem fila devolve null, e não zero', async () => {
    // "0 min" diria que a clinica atende na hora.
    const fake = createFakeClient({ rows: () => [] })

    const report = await new SupabaseReportingRepository(
      fake.client,
    ).periodReport(CLINIC, from, to)

    expect(report.queueTimes.waiting).toBeNull()
    expect(report.queueTimes.service).toBeNull()
  })

  it('sinaliza quando a leitura da fila atingiu o teto', async () => {
    const fake = createFakeClient({
      rows: (table) =>
        table === 'waiting_queue'
          ? Array.from({ length: 5000 }, () => queueRow())
          : [],
    })

    const report = await new SupabaseReportingRepository(
      fake.client,
    ).periodReport(CLINIC, from, to)

    expect(report.queueTimes.truncated).toBe(true)
  })
})
