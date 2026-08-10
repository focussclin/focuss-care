import type { Metadata } from 'next'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'

import {
  deleteServiceFromScreen,
  setServiceActiveFromScreen,
  submitServiceFromScreen,
} from '@/modules/catalog/actions/catalogScreen.actions'
import { toServiceDto } from '@/modules/catalog/application/toServiceDto'
import type { Service } from '@/modules/catalog/domain/Service'
import { isServiceRepositoryError } from '@/modules/catalog/domain/ServiceRepository'
import { getServiceRepository } from '@/modules/catalog/infrastructure/repository'
import { serviceMessages } from '@/modules/catalog/schemas/service.schema'
import { CatalogScreen } from '@/modules/catalog/ui/CatalogScreen'

export const metadata: Metadata = {
  title: 'Catálogo de serviços',
  description: 'O que a clínica oferece, quanto dura e quanto custa.',
}

/**
 * Sem `forbidden()`, e a decisão tem base na matriz.
 *
 * O catálogo é a lista da própria clínica — não há dado de paciente nem de
 * terceiro. Quem agenda precisa do nome e da duração; quem fatura precisa do
 * preço. Recusar a rota inteira a um `professional` o deixaria sem saber o que
 * a clínica oferece.
 *
 * O que É filtrado é o PREÇO: a matriz diz que `receptionist` "não vê valor
 * nenhum", e o valor é omitido no servidor, em `toServiceDto` — não escondido
 * na tela.
 */
export default async function CatalogPage() {
  await connection()

  const [source, role] = await Promise.all([getServiceRepository(), getActiveClinicRole()])

  const canSeePrice = can(role, 'invoice.read')
  const canManage = can(role, 'clinic.settings')

  let services: Service[] = []
  let loadError: string | null = null

  try {
    services = await source.repository.list(source.clinicId)
  } catch (cause) {
    if (!isServiceRepositoryError(cause)) throw cause
    loadError =
      cause.reason === 'forbidden' ? serviceMessages.forbidden : serviceMessages.unavailable
  }

  return (
    <CatalogScreen
      services={services.map((service) => toServiceDto(service, canSeePrice))}
      onSubmit={submitServiceFromScreen}
      onSetActive={setServiceActiveFromScreen}
      onDelete={deleteServiceFromScreen}
      canManage={canManage}
      canSeePrice={canSeePrice}
      isLive={source.isLive}
      loadError={loadError}
    />
  )
}
