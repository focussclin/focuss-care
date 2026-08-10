import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { isRoomRepositoryError } from '@/modules/rooms/domain/RoomRepositoryError'
import type { Room } from '@/modules/rooms/domain/Room'
import { toRoomGroups } from '@/modules/rooms/application/toRoomDto'
import { getRoomRepository } from '@/modules/rooms/infrastructure/repository'
import {
  archiveRoomFromScreen,
  submitRoomFromScreen,
  toggleRoomFromScreen,
} from '@/modules/rooms/actions/roomScreen.actions'
import { RoomsScreen } from '@/modules/rooms/ui/RoomsScreen'

export const metadata: Metadata = {
  title: 'Salas e recursos',
  description: 'Ambientes e recursos reserváveis da clínica.',
}

export default async function SalasERrecursosPage() {
  await connection()

  const source = await getRoomRepository()
  const role = await getActiveClinicRole()

  // A demonstração local não possui papel; em produção a RLS continua sendo a
  // fronteira final, e a rota não entrega a configuração a outro perfil.
  if (source.isLive && !can(role, 'clinic.settings')) forbidden()

  let rooms: Room[] = []
  let schemaPending = false

  try {
    rooms = await source.repository.list(source.clinicId)
  } catch (cause) {
    if (isRoomRepositoryError(cause) && cause.reason === 'schema-not-ready') {
      schemaPending = true
    } else {
      throw cause
    }
  }

  return (
    <RoomsScreen
      /*
       * O agrupamento acontece AQUI, no servidor — e agora o JSDoc de
       * `RoomsScreen.props.ts` diz a verdade. Ele já afirmava "agrupadas pela
       * rota" enquanto a rota só mapeava o DTO e o `reduce` vivia dentro do
       * componente cliente.
       */
      groups={toRoomGroups(rooms)}
      onSubmit={submitRoomFromScreen}
      onToggleActive={toggleRoomFromScreen}
      onArchive={archiveRoomFromScreen}
      isLive={source.isLive}
      schemaPending={schemaPending}
    />
  )
}
