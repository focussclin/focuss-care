import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { addDays, startOfDay } from '@/lib/utils/date'
import { buildOperationalInsights } from '@/modules/reporting/application/operationalInsights'
import { getReportingRepository } from '@/modules/reporting/infrastructure/repository'
import { InsightsScreen } from '@/modules/reporting/ui/InsightsScreen'

export const metadata: Metadata = {
  title: 'Insights proativos',
  description: 'Sinais operacionais explicáveis para a gestão da clínica.',
}

export default async function InsightsPage() {
  await connection()

  const role = await getActiveClinicRole()
  if (!can(role, 'report.read')) forbidden()

  const source = await getReportingRepository()
  const today = startOfDay(new Date())
  const tomorrow = addDays(today, 1)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  const [daily, period] = await Promise.all([
    source.repository.dailySnapshot(source.clinicId, today),
    source.repository.periodReport(source.clinicId, monthStart, tomorrow),
  ])

  return (
    <InsightsScreen
      insights={buildOperationalInsights(daily, period)}
      isLive={source.isLive}
      periodLabel="mês atual"
    />
  )
}
