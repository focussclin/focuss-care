import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import {
  toAuthorizationDto,
  toInsuranceSummaryDto,
  toPatientInsuranceDto,
  toPlanDto,
  toProviderDto,
} from '@/modules/insurance/application/toInsuranceDto'
import { getInsuranceRepository } from '@/modules/insurance/infrastructure/repository'
import { ConveniosScreen } from '@/modules/insurance/ui/ConveniosScreen'

export const metadata: Metadata = {
  title: 'Convênios',
  description: 'Operadoras, planos e guias de autorização da clínica.',
}

/** Quantas guias a tela carrega. Ver o JSDoc do componente sobre o recorte. */
const AUTHORIZATION_LIMIT = 50

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

  const [summary, providers, plans, authorizations, cards] = await Promise.all([
    source.repository.summary(source.clinicId),
    source.repository.listProviders(source.clinicId),
    source.repository.listPlans(source.clinicId),
    source.repository.listAuthorizations(source.clinicId, AUTHORIZATION_LIMIT),
    source.repository.listPatientInsurances(source.clinicId),
  ])

  return (
    <ConveniosScreen
      summary={toInsuranceSummaryDto(summary)}
      providers={providers.map(toProviderDto)}
      plans={plans.map(toPlanDto)}
      authorizations={authorizations.map(toAuthorizationDto)}
      cards={cards.map(toPatientInsuranceDto)}
      canManage={can(role, 'insurance.manage')}
      isLive={source.isLive}
    />
  )
}
