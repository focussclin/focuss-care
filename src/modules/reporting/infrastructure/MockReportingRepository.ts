import {
  getAppointments,
  getPatients,
  getRecentActivity,
} from '@/lib/mocks/clinic-data'
import type { ActivityEntry } from '@/modules/_shared/domain/types'

import type { DailySnapshot, PeriodReport } from '../domain/ClinicMetrics'
import type { ReportingRepository } from '../domain/ReportingRepository'

/**
 * Fallback usado enquanto o Supabase não está configurado.
 *
 * # Os números são CONTADOS, não escritos
 *
 * Antes de T-01, o painel exibia `dashboardMetrics` — 24 atendimentos, 92% de
 * comparecimento — enquanto a agenda ao lado mostrava outra coisa. Duas fontes
 * de demonstração que se contradiziam na mesma tela.
 *
 * Aqui as métricas saem das MESMAS listas que a agenda e a tela de pacientes
 * usam. Continua sendo demonstração, mas é uma demonstração coerente: o card
 * "atendimentos hoje" mostra exatamente quantos aparecem logo abaixo.
 */
export class MockReportingRepository implements ReportingRepository {
  async dailySnapshot(_clinicId: string, day: Date): Promise<DailySnapshot> {
    const appointments = getAppointments(day)
    const patients = getPatients(day)

    const isToday = (date: Date) =>
      date.getFullYear() === day.getFullYear() &&
      date.getMonth() === day.getMonth() &&
      date.getDate() === day.getDate()

    const monthStart = new Date(day.getFullYear(), day.getMonth(), 1)
    const previousMonthStart = new Date(day.getFullYear(), day.getMonth() - 1, 1)

    const completed = appointments.filter(
      (item) => item.status === 'completed',
    ).length
    const noShow = appointments.filter(
      (item) => item.status === 'no_show',
    ).length

    return {
      appointmentsToday: appointments.filter(
        (item) => isToday(item.startsAt) && item.status !== 'canceled',
      ).length,
      waitingNow: appointments.filter((item) => item.status === 'checked_in')
        .length,
      newPatientsThisMonth: patients.filter(
        (item) => item.createdAt >= monthStart,
      ).length,
      newPatientsPreviousMonth: patients.filter(
        (item) =>
          item.createdAt >= previousMonthStart && item.createdAt < monthStart,
      ).length,
      attendance:
        completed + noShow === 0
          ? null
          : {
              completed,
              noShow,
              percentage: Math.round((completed / (completed + noShow)) * 100),
            },
    }
  }

  async recentActivity(
    _clinicId: string,
    limit: number,
  ): Promise<ActivityEntry[]> {
    return getRecentActivity(new Date()).slice(0, limit)
  }

  async periodReport(
    _clinicId: string,
    from: Date,
    to: Date,
  ): Promise<PeriodReport> {
    const appointments = getAppointments(from).filter(
      (item) => item.startsAt >= from && item.startsAt < to,
    )
    const patients = getPatients(from)

    const countOf = (status: string) =>
      appointments.filter((item) => item.status === status).length

    const completed = countOf('completed')
    const noShow = countOf('no_show')

    const workload = new Map<string, { name: string; total: number }>()
    for (const item of appointments) {
      if (item.status === 'canceled') continue
      const current = workload.get(item.professionalId)
      workload.set(item.professionalId, {
        name: item.professionalName,
        total: (current?.total ?? 0) + 1,
      })
    }

    return {
      from,
      to,
      appointments: {
        total: appointments.length,
        upcoming: appointments.filter((item) =>
          ['scheduled', 'confirmed', 'checked_in', 'in_progress'].includes(
            item.status,
          ),
        ).length,
        completed,
        canceled: countOf('canceled'),
        noShow,
      },
      newPatients: patients.filter((item) => item.createdAt >= from).length,
      activePatients: patients.filter((item) => item.status !== 'inactive')
        .length,
      attendance:
        completed + noShow === 0
          ? null
          : {
              completed,
              noShow,
              percentage: Math.round((completed / (completed + noShow)) * 100),
            },
      byProfessional: [...workload.entries()]
        .map(([professionalId, value]) => ({ professionalId, ...value }))
        .sort((a, b) => b.total - a.total),
      // A demonstração é pequena por construção: nunca há o que truncar.
      truncated: false,
    }
  }
}
