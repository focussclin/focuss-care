import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { getReportingRepository } from '@/modules/reporting/infrastructure/repository'
import { IndicadoresScreen } from '@/modules/reporting/ui/IndicadoresScreen'

export const metadata: Metadata = {
  title: 'Indicadores',
  description: 'Como a clínica evoluiu nos últimos meses.',
}

/**
 * Quantos meses a série cobre.
 *
 * Doze fecha o ciclo sazonal — clínica tem janeiro fraco e março cheio, e uma
 * janela menor leria sazonalidade como tendência. São doze contagens `head`, sem
 * transferir linha.
 */
const TREND_MONTHS = 12

/**
 * Indicadores e BI.
 *
 * Não duplica `/relatorios`: aquele responde "como foi este período", este
 * responde "a clínica está crescendo?". A diferença não é de recorte, é de
 * pergunta — e a segunda é a que decide contratação e horário de funcionamento.
 *
 * A permissão é a mesma de `/relatorios` (`report.read`): quem pode ver o total
 * do mês pode ver a sequência de meses.
 */
export default async function IndicadoresPage() {
  // A série termina no mês corrente; prerenderizar a congelaria no build.
  await connection()

  const role = await getActiveClinicRole()
  if (!can(role, 'report.read')) forbidden()

  const source = await getReportingRepository()
  const trend = await source.repository.monthlyTrend(
    source.clinicId,
    new Date(),
    TREND_MONTHS,
  )

  const monthLabel = new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    year: '2-digit',
  })

  return (
    <IndicadoresScreen
      points={trend.points.map((point) => ({
        // O rótulo é formatado AQUI, no servidor: `Intl` no cliente usaria a
        // configuração do navegador, e a data mudaria de forma entre máquinas.
        label: monthLabel.format(point.month),
        appointments: point.appointments,
        completed: point.completed,
        newPatients: point.newPatients,
      }))}
      isLive={source.isLive}
    />
  )
}
