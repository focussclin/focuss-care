import { describe, expect, it } from 'vitest'

import type { DailySnapshot, PeriodReport } from '../domain/ClinicMetrics'
import { buildOperationalInsights } from './operationalInsights'

const daily: DailySnapshot = {
  appointmentsToday: 6,
  waitingNow: 2,
  newPatientsThisMonth: 2,
  newPatientsPreviousMonth: 5,
  attendance: { completed: 6, noShow: 2, percentage: 75 },
}

const period: PeriodReport = {
  from: new Date('2026-08-01T00:00:00.000Z'),
  to: new Date('2026-08-10T00:00:00.000Z'),
  appointments: {
    total: 10,
    upcoming: 1,
    completed: 6,
    canceled: 3,
    noShow: 2,
  },
  newPatients: 2,
  activePatients: 20,
  attendance: { completed: 6, noShow: 2, percentage: 75 },
  byProfessional: [
    { professionalId: 'professional-1', name: 'Dra. Ana', total: 8 },
    { professionalId: 'professional-2', name: 'Dr. Bruno', total: 2 },
  ],
  queueTimes: { waiting: null, service: null, stillWaiting: 0, truncated: false },
  truncated: false,
}

describe('buildOperationalInsights', () => {
  it('gera alertas somente a partir das métricas recebidas', () => {
    const insights = buildOperationalInsights(daily, period)

    expect(insights.map((insight) => insight.id)).toEqual([
      'waiting-now',
      'no-show-rate',
      'new-patients-slowdown',
      'cancellation-rate',
      'workload-concentration',
    ])
    expect(insights.every((insight) => insight.source.length > 0)).toBe(true)
  })

  it('não fabrica alerta quando não há volume suficiente', () => {
    const emptyDaily: DailySnapshot = {
      appointmentsToday: 0,
      waitingNow: 0,
      newPatientsThisMonth: 0,
      newPatientsPreviousMonth: 0,
      attendance: null,
    }
    const emptyPeriod: PeriodReport = {
      ...period,
      appointments: { total: 0, upcoming: 0, completed: 0, canceled: 0, noShow: 0 },
      byProfessional: [],
    }

    expect(buildOperationalInsights(emptyDaily, emptyPeriod)).toEqual([])
  })
})
