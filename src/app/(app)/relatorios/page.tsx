import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { getReportingRepository } from '@/modules/reporting/infrastructure/repository'
import {
  parsePeriod,
  resolvePeriod,
} from '@/modules/reporting/schemas/report.schema'
import { RelatoriosScreen } from '@/modules/reporting/ui/RelatoriosScreen'

export const metadata: Metadata = {
  title: 'Relatórios',
  description: 'Acompanhe os indicadores de atendimento da sua clínica.',
}

/**
 * Relatórios — feature **T-01**.
 *
 * `cacheComponents` (F-02) exige shell estático; esta rota lê sessão em cookie
 * antes de decidir o que renderizar. `instant = false` é a saída documentada, a
 * mesma já adotada na casca de `(app)` (pendência P-C2).
 */
export const instant = false

export default async function RelatoriosPage({
  searchParams,
}: PageProps<'/relatorios'>) {
  await connection()

  /*
   * Autorização ANTES da leitura.
   *
   * O relatório agrega a operação inteira — quanto cada profissional atendeu,
   * quantos pacientes faltaram. `report.read` é de `owner`, `admin` e `finance`
   * na matriz de I-05; o profissional vê a própria agenda, não o desempenho
   * comparado dos colegas.
   */
  const role = await getActiveClinicRole()
  if (!can(role, 'report.read')) forbidden()

  const { periodo } = await searchParams
  const period = resolvePeriod(parsePeriod(periodo), new Date())

  const source = await getReportingRepository()
  const report = await source.repository.periodReport(
    source.clinicId,
    period.from,
    period.to,
  )

  return (
    <RelatoriosScreen
      report={report}
      period={period}
      isLive={source.isLive}
    />
  )
}
