import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import {
  toCashSessionDto,
  toFinanceSummaryDto,
  toInvoiceDto,
  toPayableDto,
} from '@/modules/billing/application/toBillingDto'
import { getBillingRepository } from '@/modules/billing/infrastructure/repository'
import { FinanceiroScreen } from '@/modules/billing/ui/FinanceiroScreen'
import { getPatientRepository } from '@/modules/patients/infrastructure/repository'
import { getClinicSettingsRepository } from '@/modules/settings/infrastructure/repository'
import { PATIENT_PAGE_MAX_SIZE } from '@/modules/patients/schemas/patientQuery.schema'

export const metadata: Metadata = {
  title: 'Financeiro',
  description: 'Cobranças, recebimentos e o caixa da clínica.',
}

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
  const [summary, invoices, cashSession, payables, patientPage] = await Promise.all([
    billingSource.repository.summary(billingSource.clinicId, from, to),
    billingSource.repository.listInvoices(billingSource.clinicId, from, to),
    billingSource.repository.currentCashSession(billingSource.clinicId),
    billingSource.repository.listPayables(
      billingSource.clinicId,
      new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()),
    ),
    patientSource.repository.listPage(patientSource.clinicId, {
      search: null,
      status: 'active',
      limit: PATIENT_PAGE_MAX_SIZE,
      cursor: null,
    }),
  ])

  /*
   * Identidade da clínica para o recibo — leitura tenant-scoped, aqui na rota.
   *
   * `getClinicSettingsRepository` resolve a clínica ativa pelo banco; o id
   * nunca chega ao cliente, porque nada no comprovante o usa. Falha na leitura
   * **não derruba o financeiro**: o recibo diz que não carregou os dados da
   * clínica, e a tela continua servindo para cobrar e receber.
   */
  const receiptClinic = await (async () => {
    try {
      const settingsSource = await getClinicSettingsRepository()
      const settings = await settingsSource.repository.load(settingsSource.clinicId)
      return {
        tradeName: settings.profile.tradeName,
        legalName: settings.profile.legalName,
        cnpj: settings.profile.cnpj,
      }
    } catch (cause) {
      console.error('[financeiro] identidade da clínica indisponível', {
        kind: cause instanceof Error ? cause.name : typeof cause,
      })
      return null
    }
  })()

  return (
    <FinanceiroScreen
      receiptClinic={receiptClinic}
      summary={toFinanceSummaryDto(summary)}
      invoices={invoices.map(toInvoiceDto)}
      payables={payables.map(toPayableDto)}
      cashSession={cashSession ? toCashSessionDto(cashSession) : null}
      patients={patientPage.items.map((patient) => ({
        id: patient.id,
        name: patient.name,
      }))}
      periodLabel={`Período: mês corrente, até hoje`}
      canWriteInvoice={can(role, 'invoice.write')}
      canRegisterPayment={can(role, 'payment.write')}
      canManageCash={can(role, 'cash.manage')}
      canManagePayables={can(role, 'payable.write')}
      isLive={billingSource.isLive}
    />
  )
}
