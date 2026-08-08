import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { AppointmentStatus, Database } from '@/lib/supabase/database.types'
import type { ActivityEntry } from '@/modules/_shared/domain/types'

import type {
  AttendanceRate,
  DailySnapshot,
  MonthlyPoint,
  MonthlyTrend,
  PeriodReport,
  ProfessionalWorkload,
} from '../domain/ClinicMetrics'
import type { ReportingRepository } from '../domain/ReportingRepository'

type Client = SupabaseClient<Database>

/**
 * Teto de linhas lidas por relatório de período.
 *
 * Uma clínica movimentada faz algo perto de 2.000 atendimentos por mês, então
 * 5.000 cobre com folga os períodos que a tela oferece. O teto existe para que
 * um período grande não traga a agenda inteira para a memória do servidor — e,
 * quando ele é atingido, `truncated` avisa em vez de deixar o número mentir.
 */
const PERIOD_ROW_CAP = 5000

/** Desfechos que não contam como atendimento realizado nem previsto. */
const CANCELED: readonly AppointmentStatus[] = ['canceled']

const UPCOMING: readonly AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'checked_in',
  'in_progress',
]

/**
 * Adapter dos indicadores — feature **T-01**.
 *
 * Toda consulta filtra `clinic_id` explicitamente. A RLS já impediria a leitura
 * de outra clínica; o filtro impede a CONTAGEM errada, que é o modo silencioso
 * de errar aqui — um número inflado não parece defeito, parece um bom mês.
 */
export class SupabaseReportingRepository implements ReportingRepository {
  constructor(private readonly client: Client) {}

  async dailySnapshot(clinicId: string, day: Date): Promise<DailySnapshot> {
    const dayStart = startOfDay(day)
    const dayEnd = addDays(dayStart, 1)
    const monthStart = startOfMonth(day)
    const previousMonthStart = addMonths(monthStart, -1)
    const attendanceFloor = addDays(dayEnd, -30)

    const [
      appointmentsToday,
      waitingNow,
      newPatientsThisMonth,
      newPatientsPreviousMonth,
      attendance,
    ] = await Promise.all([
      this.countAppointmentsInDay(clinicId, dayStart, dayEnd),
      this.countWaiting(clinicId, dayStart),
      this.countNewPatients(clinicId, monthStart, dayEnd),
      this.countNewPatients(clinicId, previousMonthStart, monthStart),
      this.attendanceRate(clinicId, attendanceFloor, dayEnd),
    ])

    return {
      appointmentsToday,
      waitingNow,
      newPatientsThisMonth,
      newPatientsPreviousMonth,
      attendance,
    }
  }

  async periodReport(
    clinicId: string,
    from: Date,
    to: Date,
  ): Promise<PeriodReport> {
    /*
     * Uma consulta só, e não cinco contagens.
     *
     * `byProfessional` precisa agrupar, e o PostgREST não agrupa — as linhas
     * teriam de vir de qualquer forma. Trazendo `status` junto, os totais saem
     * do mesmo conjunto, e o relatório inteiro fica consistente: cinco
     * contagens separadas poderiam pegar estados diferentes do banco entre uma
     * e outra e não fechar a soma.
     */
    const [rowsResult, newPatients, activePatients] = await Promise.all([
      this.client
        .from('appointments')
        .select('professional_id, status, professionals ( display_name )')
        .eq('clinic_id', clinicId)
        .gte('starts_at', from.toISOString())
        .lt('starts_at', to.toISOString())
        .limit(PERIOD_ROW_CAP),
      this.countNewPatients(clinicId, from, to),
      this.countActivePatients(clinicId),
    ])

    if (rowsResult.error) throw readFailure('periodReport', rowsResult.error)

    const rows = (rowsResult.data ?? []) as unknown as {
      professional_id: string
      status: AppointmentStatus
      professionals: { display_name: string } | null
    }[]

    const totals = {
      total: rows.length,
      upcoming: 0,
      completed: 0,
      canceled: 0,
      noShow: 0,
    }

    const workload = new Map<string, ProfessionalWorkload>()

    for (const row of rows) {
      if (row.status === 'completed') totals.completed += 1
      else if (row.status === 'canceled') totals.canceled += 1
      else if (row.status === 'no_show') totals.noShow += 1
      else if (UPCOMING.includes(row.status)) totals.upcoming += 1

      // Cancelado não é carga de trabalho: contá-lo diria que o profissional
      // atendeu alguém que não veio.
      if (row.status === 'canceled') continue

      const current = workload.get(row.professional_id)
      if (current) {
        workload.set(row.professional_id, {
          ...current,
          total: current.total + 1,
        })
      } else {
        workload.set(row.professional_id, {
          professionalId: row.professional_id,
          name: row.professionals?.display_name ?? 'Profissional',
          total: 1,
        })
      }
    }

    return {
      from,
      to,
      appointments: totals,
      newPatients,
      activePatients,
      attendance: toAttendanceRate(totals.completed, totals.noShow),
      byProfessional: [...workload.values()].sort((a, b) => b.total - a.total),
      truncated: rows.length >= PERIOD_ROW_CAP,
    }
  }

  async recentActivity(
    clinicId: string,
    limit: number,
  ): Promise<ActivityEntry[]> {
    /*
     * Três fontes, e nenhuma é `audit_log`.
     *
     * A policy de INSERT daquela tabela recusa o membro autenticado (P-P6), o
     * que a mantém vazia. Um feed lido de lá ficaria permanentemente em branco
     * sem que ninguém entendesse por quê — e o painel pareceria quebrado.
     */
    const [appointments, patients, encounters] = await Promise.all([
      this.client
        .from('appointments')
        .select('id, created_by, created_at')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .limit(limit),
      this.client
        .from('patients')
        .select('id, created_by, created_at')
        .eq('clinic_id', clinicId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit),
      this.client
        .from('encounters')
        .select('id, created_by, ended_at')
        .eq('clinic_id', clinicId)
        .eq('status', 'closed')
        .not('ended_at', 'is', null)
        .order('ended_at', { ascending: false })
        .limit(limit),
    ])

    for (const [context, result] of [
      ['activity.appointments', appointments],
      ['activity.patients', patients],
      ['activity.encounters', encounters],
    ] as const) {
      if (result.error) {
        // Feed é acessório: o painel continua útil sem ele. Derrubar a tela
        // inteira porque a atividade não carregou seria trocar um problema
        // pequeno por um grande.
        console.error(`[reporting] ${context}`, {
          code: result.error.code ?? null,
        })
      }
    }

    const raw: { id: string; userId: string | null; at: string; text: string }[] =
      [
        ...(appointments.data ?? []).map((row) => ({
          id: `apt-${row.id}`,
          userId: row.created_by,
          at: row.created_at,
          text: 'agendou um atendimento.',
        })),
        ...(patients.data ?? []).map((row) => ({
          id: `pat-${row.id}`,
          userId: row.created_by,
          at: row.created_at,
          text: 'cadastrou um paciente.',
        })),
        ...(encounters.data ?? [])
          .filter((row): row is typeof row & { ended_at: string } =>
            Boolean(row.ended_at),
          )
          .map((row) => ({
            id: `enc-${row.id}`,
            userId: row.created_by,
            at: row.ended_at,
            text: 'encerrou um atendimento.',
          })),
      ]

    /*
     * Nenhuma descrição acima cita o paciente.
     *
     * "Encerrou o atendimento de Fulano" diria, para qualquer pessoa com acesso
     * ao painel, quem foi atendido e quando. O painel não tem recorte por papel
     * — o financeiro o vê igual ao recepcionista — e isso é informação de saúde.
     */
    const names = await this.resolveNames(raw.map((entry) => entry.userId))

    return raw
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit)
      .map((entry) => ({
        id: entry.id,
        actorName: entry.userId
          ? (names.get(entry.userId) ?? 'Alguém da equipe')
          : 'Alguém da equipe',
        description: entry.text,
        occurredAt: new Date(entry.at),
      }))
  }

  /**
   * Nomes dos autores, em uma consulta.
   *
   * Separado do feed porque `created_by` aponta para `profiles` por três tabelas
   * diferentes, e um embed por FK exigiria nomear cada constraint — nome de
   * constraint é detalhe do banco que quebra em silêncio quando muda.
   */
  private async resolveNames(
    userIds: readonly (string | null)[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))]
    const result = new Map<string, string>()

    if (unique.length === 0) return result

    const { data, error } = await this.client
      .from('profiles')
      .select('id, full_name')
      .in('id', unique)

    if (error) {
      console.error('[reporting] resolveNames', { code: error.code ?? null })
      return result
    }

    for (const row of data ?? []) result.set(row.id, row.full_name)

    return result
  }

  private async countAppointmentsInDay(
    clinicId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    // Cancelado sai da conta: o card diz quantos atendimentos a clínica TEM
    // hoje, e um cancelado não é atendimento — é um horário que voltou a ficar
    // livre.
    const { count, error } = await this.client
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .gte('starts_at', from.toISOString())
      .lt('starts_at', to.toISOString())
      .not('status', 'in', toInList(CANCELED))

    if (error) throw readFailure('countAppointmentsInDay', error)

    return count ?? 0
  }

  private async countWaiting(clinicId: string, since: Date): Promise<number> {
    // `arrived_at >= hoje` impede que alguém esquecido na fila de ontem apareça
    // como paciente esperando agora — e o card é lido como "agora".
    const { count, error } = await this.client
      .from('waiting_queue')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('status', 'waiting')
      .gte('arrived_at', since.toISOString())

    if (error) throw readFailure('countWaiting', error)

    return count ?? 0
  }

  private async countNewPatients(
    clinicId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    const { count, error } = await this.client
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .gte('created_at', from.toISOString())
      .lt('created_at', to.toISOString())

    if (error) throw readFailure('countNewPatients', error)

    return count ?? 0
  }

  private async countActivePatients(clinicId: string): Promise<number> {
    const { count, error } = await this.client
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .eq('is_active', true)

    if (error) throw readFailure('countActivePatients', error)

    return count ?? 0
  }

  private async attendanceRate(
    clinicId: string,
    from: Date,
    to: Date,
  ): Promise<AttendanceRate | null> {
    const countByStatus = async (status: AppointmentStatus) => {
      const { count, error } = await this.client
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('status', status)
        .gte('starts_at', from.toISOString())
        .lt('starts_at', to.toISOString())

      if (error) throw readFailure('attendanceRate', error)

      return count ?? 0
    }

    const [completed, noShow] = await Promise.all([
      countByStatus('completed'),
      countByStatus('no_show'),
    ])

    return toAttendanceRate(completed, noShow)
  }
  /**
   * Serie mensal — uma contagem por mes, sem transferir linha.
   *
   * Poderia ser uma leitura so, agrupando no cliente, e seria pior: teria de
   * trazer todas as linhas do periodo para conta-las, esbarraria no
   * `PERIOD_ROW_CAP` e devolveria uma serie AMOSTRADA com cara de completa.
   * Doze contagens `head` sao doze idas ao banco e zero linha no fio.
   *
   * O filtro de tenant vai em toda contagem, como no resto do adapter: a RLS e
   * a ultima linha, nao a unica.
   */
  async monthlyTrend(
    clinicId: string,
    reference: Date,
    months: number,
  ): Promise<MonthlyTrend> {
    const currentMonthStart = startOfMonth(reference)

    const windows = Array.from({ length: months }, (_, index) => {
      const from = addMonths(currentMonthStart, index - (months - 1))
      return { from, to: addMonths(from, 1) }
    })

    const points = await Promise.all(
      windows.map(async ({ from, to }): Promise<MonthlyPoint> => {
        const [appointments, completed, newPatients] = await Promise.all([
          this.countAppointments(clinicId, from, to, null),
          this.countAppointments(clinicId, from, to, 'completed'),
          this.countNewPatients(clinicId, from, to),
        ])

        return { month: from, appointments, completed, newPatients }
      }),
    )

    return { points }
  }

  /** Atendimentos da janela; `status` nulo conta tudo menos cancelado. */
  private async countAppointments(
    clinicId: string,
    from: Date,
    to: Date,
    status: AppointmentStatus | null,
  ): Promise<number> {
    const query = this.client
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .gte('starts_at', from.toISOString())
      .lt('starts_at', to.toISOString())

    const { count, error } = await (status === null
      ? query.not('status', 'in', toInList(CANCELED))
      : query.eq('status', status))

    if (error) throw readFailure('monthlyTrend.appointments', error)

    return count ?? 0
  }

}

/**
 * `null` quando não há desfecho registrado — e isso NÃO é 0%.
 *
 * Zero por cento significa que ninguém compareceu. Exibi-lo numa clínica que
 * ainda não fechou nenhum atendimento acusaria a operação de um problema que
 * não existe.
 */
function toAttendanceRate(
  completed: number,
  noShow: number,
): AttendanceRate | null {
  const base = completed + noShow
  if (base === 0) return null

  return {
    completed,
    noShow,
    percentage: Math.round((completed / base) * 100),
  }
}

/** `['canceled']` -> `("canceled")`, no formato que o PostgREST espera. */
function toInList(values: readonly string[]): string {
  return `(${values.map((value) => `"${value}"`).join(',')})`
}

function startOfDay(date: Date): Date {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function startOfMonth(date: Date): Date {
  const copy = new Date(date)
  copy.setDate(1)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function addMonths(date: Date, months: number): Date {
  const copy = new Date(date)
  copy.setMonth(copy.getMonth() + months)
  return copy
}

function readFailure(
  context: string,
  error: { code?: string | null; message?: string | null },
): Error {
  /*
   * Só `code` vai para o log.
   *
   * A mensagem do Postgres pode ecoar valores da consulta, e aqui as consultas
   * filtram por clínica e por data — nada clínico, mas também nada que precise
   * circular. `code` basta para saber o que houve.
   */
  console.error(`[reporting] ${context}`, { code: error.code ?? null })

  return new Error('Não foi possível carregar os indicadores.')
}
