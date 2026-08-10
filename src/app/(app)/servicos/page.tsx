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
import {
  removePriceListItemFromScreen,
  setDefaultPriceListFromScreen,
  setItemPriceFromScreen,
  setPriceListActiveFromScreen,
  submitPriceListFromScreen,
} from '@/modules/catalog/actions/priceListScreen.actions'
import { toPriceListDto } from '@/modules/catalog/application/toPriceListDto'
import type { PriceList } from '@/modules/catalog/domain/PriceList'
import { isPriceListError } from '@/modules/catalog/domain/PriceListRepository'
import { getPriceListSource } from '@/modules/catalog/infrastructure/price-list-repository'
import { priceListMessages } from '@/modules/catalog/schemas/priceList.schema'
import { CatalogScreen } from '@/modules/catalog/ui/CatalogScreen'
import { PriceListsPanel } from '@/modules/catalog/ui/PriceListsPanel'

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

  /*
   * As tabelas de preço têm leitura própria, e falha própria.
   *
   * Se elas não carregarem, o catálogo continua servindo: os dois vivem na mesma
   * tela mas respondem por coisas diferentes, e derrubar um por causa do outro
   * tiraria do ar o cadastro de serviço por um problema de preço de convênio.
   */
  const priceListSource = await getPriceListSource()

  let priceLists: PriceList[] = []
  let priceListsError: string | null = null

  try {
    priceLists = await priceListSource.repository.list(priceListSource.clinicId)
  } catch (cause) {
    if (!isPriceListError(cause)) throw cause
    priceListsError =
      cause.reason === 'forbidden'
        ? priceListMessages.forbidden
        : priceListMessages.unavailable
  }

  return (
    <CatalogScreen
      priceListsSlot={
        <PriceListsPanel
          lists={priceLists.map(toPriceListDto)}
          services={services
            .filter((service) => service.isActive)
            .map((service) => ({ id: service.id, name: service.name }))}
          onSubmitList={submitPriceListFromScreen}
          onSetActive={setPriceListActiveFromScreen}
          onSetDefault={setDefaultPriceListFromScreen}
          onSetItemPrice={setItemPriceFromScreen}
          onRemoveItem={removePriceListItemFromScreen}
          canManage={canManage}
          isLive={priceListSource.isLive}
          loadError={priceListsError}
        />
      }
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
