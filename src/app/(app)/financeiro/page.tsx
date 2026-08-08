import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import {
  toCashSessionDto,
  toFinanceSummaryDto,
  toInvoiceDto,
} from '@/modules/billing/application/toBillingDto'
import { getBillingRepository } from '@/modules/billing/infrastructure/repository'
import { FinanceiroScreen } from '@/modules/billing/ui/FinanceiroScreen'
import { getPatientRepository } from '@/modules/patients/infrastructure/repository'
import { PATIENT_PAGE_MAX_SIZE } from '@/modules/patients/schemas/patientQuery.schema'

export const metadata: Metadata = {
  title: 'Financeiro',
  description: 'Cobranças, recebimentos e o caixa da clínica.',
}

/**
 * Financeiro — feature **B-01**.
 *
 * `cacheComponents` (F-02) exige shell estático; esta rota lê sessão em cookie
 * antes de decidir o que renderizar. `instant = false` é a saída documentada, a
 * mesma já adotada na casca de `(app)` (pendência P-C2).
 */
export const instant = false

export default async function FinanceiroPage() {
  await connection()

  /*
   * Autorização ANTES da leitura.
   *
   * Quanto cada paciente deve é dado sensível de outra natureza que o clínico,
   * e igualmente pessoal. `invoice.read` é de `owner`, `admin` e `finance` na
   * matriz de I-05 — a recepção marca consulta sem saber quanto ela custa.
   */
  const role = await getActiveClinicRole()
  if (!can(role, 'invoice.read')) forbidden()

  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

  const [billingSource, patientSource] = await Promise.all([
    getBillingRepository(),
    getPatientRepository(now),
  ])

  /*
   * Composição entre módulos acontece na ROTA (regra 4): `billing` não alcança
   * o interior de `patients`. O seletor de paciente da nova cobrança carrega a
   * PRIMEIRA página, não a base inteira — mesma troca honesta feita em /agenda.
   */
  const [summary, invoices, cashSession, patientPage] = await Promise.all([
    billingSource.repository.summary(billingSource.clinicId, from, to),
    billingSource.repository.listInvoices(billingSource.clinicId, from, to),
    billingSource.repository.currentCashSession(billingSource.clinicId),
    patientSource.repository.listPage(patientSource.clinicId, {
      search: null,
      status: 'active',
      limit: PATIENT_PAGE_MAX_SIZE,
      cursor: null,
    }),
  ])

  return (
    <FinanceiroScreen
      summary={toFinanceSummaryDto(summary)}
      invoices={invoices.map(toInvoiceDto)}
      cashSession={cashSession ? toCashSessionDto(cashSession) : null}
      patients={patientPage.items.map((patient) => ({
        id: patient.id,
        name: patient.name,
      }))}
      periodLabel={`Período: mês corrente, até hoje`}
      canWriteInvoice={can(role, 'invoice.write')}
      canRegisterPayment={can(role, 'payment.write')}
      canManageCash={can(role, 'cash.manage')}
      isLive={billingSource.isLive}
    />
  )
}
