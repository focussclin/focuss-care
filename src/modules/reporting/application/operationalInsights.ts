import type { DailySnapshot, PeriodReport } from '../domain/ClinicMetrics'

export type InsightSeverity = 'critical' | 'attention' | 'positive'

export interface OperationalInsight {
  id: string
  severity: InsightSeverity
  title: string
  description: string
  actionLabel: string
  href: '/agenda' | '/atendimentos' | '/pacientes' | '/relatorios'
  source: string
}

/**
 * Regras explicáveis para o primeiro motor de insights.
 *
 * Não há modelo de IA nem número de mercado aqui: cada alerta nasce de uma
 * métrica que o reporting já consulta, e a base aparece na tela. Isso permite
 * evoluir para IA depois sem transformar uma heurística em verdade escondida.
 */
export function buildOperationalInsights(
  daily: DailySnapshot,
  period: PeriodReport,
): OperationalInsight[] {
  const insights: OperationalInsight[] = []

  if (daily.waitingNow > 0) {
    insights.push({
      id: 'waiting-now',
      severity: 'critical',
      title: `${daily.waitingNow} ${daily.waitingNow === 1 ? 'paciente aguarda' : 'pacientes aguardam'} atendimento`,
      description:
        'A fila presencial tem pessoas aguardando agora. Confira a recepção e avise o próximo profissional.',
      actionLabel: 'Abrir recepção',
      href: '/atendimentos',
      source: 'waiting_queue · hoje',
    })
  }

  if (daily.attendance && daily.attendance.completed + daily.attendance.noShow >= 3) {
    if (daily.attendance.noShow / (daily.attendance.completed + daily.attendance.noShow) >= 0.15) {
      insights.push({
        id: 'no-show-rate',
        severity: 'attention',
        title: `Taxa de faltas em ${daily.attendance.percentage === 0 ? 100 : 100 - daily.attendance.percentage}%`,
        description:
          'A taxa de comparecimento dos últimos 30 dias indica espaço para reforçar confirmações e recuperação de pacientes.',
        actionLabel: 'Ver agenda',
        href: '/agenda',
        source: 'appointments · últimos 30 dias',
      })
    }
  }

  if (
    daily.newPatientsPreviousMonth > 0 &&
    daily.newPatientsThisMonth < daily.newPatientsPreviousMonth
  ) {
    insights.push({
      id: 'new-patients-slowdown',
      severity: 'attention',
      title: 'Entrada de pacientes abaixo do mês anterior',
      description: `Este mês tem ${daily.newPatientsThisMonth} novos pacientes contra ${daily.newPatientsPreviousMonth} no mês anterior.`,
      actionLabel: 'Ver pacientes',
      href: '/pacientes',
      source: 'patients · mês atual x anterior',
    })
  }

  if (period.appointments.total >= 5) {
    const cancellationRate = period.appointments.canceled / period.appointments.total
    if (cancellationRate >= 0.2) {
      insights.push({
        id: 'cancellation-rate',
        severity: 'attention',
        title: 'Cancelamentos pressionam a agenda',
        description: `${period.appointments.canceled} de ${period.appointments.total} horários do período foram cancelados.`,
        actionLabel: 'Analisar relatórios',
        href: '/relatorios',
        source: 'appointments · mês atual',
      })
    }
  }

  if (period.byProfessional.length >= 2 && period.appointments.total >= 5) {
    const top = period.byProfessional[0]
    const average = period.byProfessional.reduce((sum, item) => sum + item.total, 0) / period.byProfessional.length
    if (top && top.total >= 5 && top.total >= average * 1.5) {
      insights.push({
        id: 'workload-concentration',
        severity: 'attention',
        title: 'Agenda concentrada em um profissional',
        description: `${top.name} concentra ${top.total} atendimentos não cancelados no período.`,
        actionLabel: 'Abrir relatórios',
        href: '/relatorios',
        source: 'appointments · distribuição por profissional',
      })
    }
  }

  return insights
}
