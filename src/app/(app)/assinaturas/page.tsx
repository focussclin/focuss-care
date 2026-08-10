import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { startOfDay } from '@/lib/utils/date'
import { toSubscriptionView } from '@/modules/subscription/application/toSubscriptionView'
import { getSubscriptionRepository } from '@/modules/subscription/infrastructure/repository'
import { AssinaturaScreen } from '@/modules/subscription/ui/AssinaturaScreen'

export const metadata: Metadata = {
  title: 'Assinatura',
  description: 'Plano contratado e uso das cotas da clínica.',
}

/**
 * Assinatura da clínica no Focuss Care.
 *
 * `clinic.settings` e não `report.read`: o plano é decisão administrativa sobre
 * a conta, e quem lê relatório não decide contratação. É a mesma permissão que
 * governa a identidade da clínica em `/configuracoes`.
 *
 * A leitura não é cacheada — o estado da assinatura muda por FORA do produto
 * (hoje, pelo suporte), e uma tela em cache mostraria "ativa" depois do corte.
 */
export default async function AssinaturasPage() {
  await connection()

  const role = await getActiveClinicRole()
  if (!can(role, 'clinic.settings')) forbidden()

  const source = await getSubscriptionRepository(startOfDay(new Date()))
  const overview = await source.repository.overview(source.clinicId)
  const view = toSubscriptionView(overview)

  return (
    <AssinaturaScreen
      plan={view.plan}
      quotas={view.quotas}
      isLive={source.isLive}
    />
  )
}
