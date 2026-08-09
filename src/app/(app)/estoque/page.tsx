import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import {
  recordInventoryMovementFromScreen,
  submitInventoryItemFromScreen,
  toggleInventoryItemFromScreen,
} from '@/modules/inventory/actions/inventoryScreen.actions'
import { toInventoryItemDto, toInventoryMovementDto } from '@/modules/inventory/application/toInventoryDto'
import { isInventoryRepositoryError } from '@/modules/inventory/domain/InventoryRepositoryError'
import { getInventoryRepository } from '@/modules/inventory/infrastructure/repository'
import { InventoryScreen } from '@/modules/inventory/ui/InventoryScreen'

export const metadata: Metadata = {
  title: 'Estoque',
  description: 'Controle de insumos e movimentações da clínica.',
}

export default async function InventoryPage() {
  await connection()

  const source = await getInventoryRepository()
  const role = await getActiveClinicRole()
  if (source.isLive && !can(role, 'invoice.read')) forbidden()

  let items = [] as Awaited<ReturnType<typeof source.repository.listItems>>
  let movements = [] as Awaited<ReturnType<typeof source.repository.listRecentMovements>>
  let schemaPending = false

  try {
    const loaded = await Promise.all([
      source.repository.listItems(source.clinicId),
      source.repository.listRecentMovements(source.clinicId),
    ])
    items = loaded[0]
    movements = loaded[1]
  } catch (cause) {
    if (isInventoryRepositoryError(cause) && cause.reason === 'schema-not-ready') {
      schemaPending = true
    } else {
      throw cause
    }
  }

  return (
    <InventoryScreen
      items={items.map(toInventoryItemDto)}
      movements={movements.map(toInventoryMovementDto)}
      onSubmitItem={submitInventoryItemFromScreen}
      onToggleItem={toggleInventoryItemFromScreen}
      onRecordMovement={recordInventoryMovementFromScreen}
      isLive={source.isLive}
      schemaPending={schemaPending}
    />
  )
}
