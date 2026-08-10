'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toRoomFailure } from '../application/roomFailure'
import { toRoomDto } from '../application/toRoomDto'
import { roomRepositoryFor } from '../infrastructure/repository'
import {
  roomMessages,
  toggleRoomActiveSchema,
  type ToggleRoomActiveInput,
} from '../schemas/room.schema'
import type { RoomDto } from '../schemas/room.schema'

const runToggleRoomActive = createAction<
  ToggleRoomActiveInput,
  RoomDto,
  'roomId' | 'isActive'
>({
  name: 'room.toggleActive',
  schema: toggleRoomActiveSchema,
  roles: rolesWith('clinic.settings'),
  messages: {
    forbidden: roomMessages.forbidden,
    validation: roomMessages.invalidFields,
    unavailable: roomMessages.unavailable,
    unexpected: roomMessages.unexpected,
  },
  revalidatePaths: ['/salas-e-recursos', '/agenda'],
  handler: async (input, context) => {
    try {
      const room = await roomRepositoryFor(context.supabase).setActive(
        context.clinicId,
        input.roomId,
        input.isActive,
      )
      return ok(toRoomDto(room))
    } catch (cause) {
      return toRoomFailure<'roomId' | 'isActive'>('room.toggleActive', cause)
    }
  },
  audit: (output) => ({
    action: output.isActive ? 'room.activated' : 'room.deactivated',
    entityType: 'room',
    entityId: output.id,
    after: { is_active: output.isActive },
  }),
})

export async function toggleRoomActiveAction(
  rawInput: unknown,
): Promise<ActionResult<RoomDto, 'roomId' | 'isActive'>> {
  return runToggleRoomActive(rawInput)
}
