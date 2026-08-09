'use server'

import { createRoomAction } from './createRoom.action'
import { toggleRoomActiveAction } from './toggleRoomActive.action'
import { updateRoomAction } from './updateRoom.action'
import type { RoomFormValues } from '../schemas/room.schema'

/** Adapter de Server Actions para a view: a camada visual recebe só mensagens. */
export async function submitRoomFromScreen(
  values: RoomFormValues,
  roomId: string | null,
): Promise<string | null> {
  const result = roomId
    ? await updateRoomAction({ roomId, ...values })
    : await createRoomAction(values)

  return result.ok ? null : result.error.message
}

export async function toggleRoomFromScreen(
  roomId: string,
  isActive: boolean,
): Promise<string | null> {
  const result = await toggleRoomActiveAction({ roomId, isActive })
  return result.ok ? null : result.error.message
}
