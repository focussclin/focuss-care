import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { startOfDay } from '@/lib/utils/date'
import {
  toAuthorizationDto,
  toClaimDenialDto,
  toClaimInvoiceOptionDto,
  toInsuranceSummaryDto,
  toPatientInsuranceDto,
  toPatientInsuranceRecordDto,
  toPlanDto,
  toProviderDto,
} from '@/modules/insurance/application/toInsuranceDto'
import { getInsuranceRepository } from '@/modules/insurance/infrastructure/repository'
import { ConveniosScreen } from '@/modules/insurance/ui/ConveniosScreen'
import { getPatientRepository } from '@/modules/patients/infrastructure/repository'
import { PATIENT_PAGE_MAX_SIZE } from '@/modules/patients/schemas/patientQuery.schema'

export const metadata: Metadata = {
  title: 'Convênios',
  description: 'Operadoras, planos e guias de autorização da clínica.',
}

/** Quantas guias a tela carrega. Ver o JSDoc do componente sobre o recorte. */
const AUTHORIZATION_LIMIT = 50
const CLAIM_DENIAL_LIMIT = 50
const CLAIM_INVOICE_LIMIT = 100

export default async function ConveniosPage() {
  await connection()

  /*
   * Autorização ANTES da leitura.
   *
   * A tela lista nome de paciente ao lado do procedimento solicitado — que é
   * dado clínico por implicação: saber que alguém pediu autorização para uma
   * ressonância de coluna diz o que está sendo investigado. `insurance.manage`
   * é de `owner`, `admin` e `finance` na matriz de I-05.
   */
  const role = await getActiveClinicRole()
  if (!can(role, 'insurance.manage')) forbidden()

  const source = await getInsuranceRepository()
  const patientSource = await getPatientRepository(startOfDay(new Date()))

  const [
    summary,
    providers,
    plans,
    authorizations,
    cards,
    patientInsuranceRecords,
    claimDenials,
    claimInvoices,
    patientPage,
  ] = await Promise.all([
    source.repository.summary(source.clinicId),
    source.repository.listProviders(source.clinicId),
    source.repository.listPlans(source.clinicId),
    source.repository.listAuthorizations(source.clinicId, AUTHORIZATION_LIMIT),
    source.repository.listPatientInsurances(source.clinicId),
    source.repository.listPatientInsuranceRecords(source.clinicId),
    source.repository.listClaimDenials(source.clinicId, CLAIM_DENIAL_LIMIT),
    source.repository.listClaimInvoiceOptions(
      source.clinicId,
      CLAIM_INVOICE_LIMIT,
    ),
    patientSource.repository.listPage(patientSource.clinicId, {
      search: null,
      status: 'active',
      limit: PATIENT_PAGE_MAX_SIZE,
      cursor: null,
    }),
  ])

  return (
    <ConveniosScreen
      summary={toInsuranceSummaryDto(summary)}
      providers={providers.map(toProviderDto)}
      plans={plans.map(toPlanDto)}
      authorizations={authorizations.map(toAuthorizationDto)}
      cards={cards.map(toPatientInsuranceDto)}
      claimDenials={claimDenials.map(toClaimDenialDto)}
      claimInvoices={claimInvoices.map(toClaimInvoiceOptionDto)}
      patientInsurances={patientInsuranceRecords.map(toPatientInsuranceRecordDto)}
      patients={patientPage.items.map((patient) => ({ id: patient.id, name: patient.name }))}
      canManage={can(role, 'insurance.manage')}
      isLive={source.isLive}
    />
  )
}
