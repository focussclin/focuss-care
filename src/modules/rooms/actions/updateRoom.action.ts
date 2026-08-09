'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toRoomFailure } from '../application/roomFailure'
import { toRoomDto } from '../application/toRoomDto'
import { roomRepositoryFor } from '../infrastructure/repository'
import {
  roomMessages,
  updateRoomSchema,
  type UpdateRoomInput,
} from '../schemas/room.schema'
import type { RoomDto } from '../schemas/room.schema'

const runUpdateRoom = createAction<
  UpdateRoomInput,
  RoomDto,
  'roomId' | 'name' | 'kind' | 'capacity' | 'notes'
>({
  name: 'room.update',
  schema: updateRoomSchema,
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
      const room = await roomRepositoryFor(context.supabase).update(
        context.clinicId,
        input.roomId,
        {
          name: input.name,
          kind: input.kind,
          capacity: input.capacity,
          notes: input.notes || null,
        },
      )

      return ok(toRoomDto(room))
    } catch (cause) {
      return toRoomFailure<'roomId' | 'name' | 'kind' | 'capacity' | 'notes'>(
        'room.update',
        cause,
      )
    }
  },
  audit: (output) => ({
    action: 'room.updated',
    entityType: 'room',
    entityId: output.id,
    after: { name: output.name, kind: output.kind, is_active: output.isActive },
  }),
})

export async function updateRoomAction(
  rawInput: unknown,
): Promise<ActionResult<RoomDto, 'roomId' | 'name' | 'kind' | 'capacity' | 'notes'>> {
  return runUpdateRoom(rawInput)
}
