import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import {
  receivePurchaseOrderItemFromScreen,
  submitPurchaseOrderFromScreen,
  submitPurchaseSupplierFromScreen,
  togglePurchaseSupplierFromScreen,
  transitionPurchaseOrderFromScreen,
} from '@/modules/purchases/actions/purchaseScreen.actions'
import {
  toPurchaseCatalogItemDto,
  toPurchaseOrderDto,
  toPurchaseSupplierDto,
} from '@/modules/purchases/application/toPurchaseDto'
import { isPurchaseRepositoryError } from '@/modules/purchases/domain/PurchaseRepositoryError'
import { getPurchaseRepository } from '@/modules/purchases/infrastructure/repository'
import { PurchasesScreen } from '@/modules/purchases/ui/PurchasesScreen'

export const metadata: Metadata = {
  title: 'Compras',
  description: 'Fornecedores, pedidos e recebimentos da clínica.',
}

export default async function PurchasesPage() {
  await connection()

  const source = await getPurchaseRepository()
  const role = await getActiveClinicRole()
  if (source.isLive && !can(role, 'invoice.read')) forbidden()

  let suppliers = [] as Awaited<ReturnType<typeof source.repository.listSuppliers>>
  let catalog = [] as Awaited<ReturnType<typeof source.repository.listCatalog>>
  let orders = [] as Awaited<ReturnType<typeof source.repository.listOrders>>
  let schemaPending = false

  try {
    const loaded = await Promise.all([
      source.repository.listSuppliers(source.clinicId),
      source.repository.listCatalog(source.clinicId),
      source.repository.listOrders(source.clinicId),
    ])
    suppliers = loaded[0]
    catalog = loaded[1]
    orders = loaded[2]
  } catch (cause) {
    if (isPurchaseRepositoryError(cause) && cause.reason === 'schema-not-ready') {
      schemaPending = true
    } else {
      throw cause
    }
  }

  return (
    <PurchasesScreen
      suppliers={suppliers.map(toPurchaseSupplierDto)}
      catalog={catalog.map(toPurchaseCatalogItemDto)}
      orders={orders.map(toPurchaseOrderDto)}
      onSubmitSupplier={submitPurchaseSupplierFromScreen}
      onToggleSupplier={togglePurchaseSupplierFromScreen}
      onSubmitOrder={submitPurchaseOrderFromScreen}
      onTransitionOrder={transitionPurchaseOrderFromScreen}
      onReceiveOrderItem={receivePurchaseOrderItemFromScreen}
      isLive={source.isLive}
      schemaPending={schemaPending}
    />
  )
}
