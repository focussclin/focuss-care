'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toRoomFailure } from '../application/roomFailure'
import { toRoomDto } from '../application/toRoomDto'
import { roomRepositoryFor } from '../infrastructure/repository'
import {
  createRoomSchema,
  roomMessages,
  type CreateRoomInput,
} from '../schemas/room.schema'
import type { RoomDto } from '../schemas/room.schema'

const messages = {
  forbidden: roomMessages.forbidden,
  validation: roomMessages.invalidFields,
  unavailable: roomMessages.unavailable,
  unexpected: roomMessages.unexpected,
}

const runCreateRoom = createAction<CreateRoomInput, RoomDto, 'name' | 'kind' | 'capacity' | 'notes'>({
  name: 'room.create',
  schema: createRoomSchema,
  roles: rolesWith('clinic.settings'),
  messages,
  revalidatePaths: ['/salas-e-recursos', '/agenda'],
  handler: async (input, context) => {
    try {
      const room = await roomRepositoryFor(context.supabase).create(
        context.clinicId,
        {
          name: input.name,
          kind: input.kind,
          capacity: input.capacity,
          notes: input.notes || null,
        },
      )

      return ok(toRoomDto(room))
    } catch (cause) {
      return toRoomFailure<'name' | 'kind' | 'capacity' | 'notes'>(
        'room.create',
        cause,
      )
    }
  },
  audit: (output) => ({
    action: 'room.created',
    entityType: 'room',
    entityId: output.id,
    after: { name: output.name, kind: output.kind, is_active: output.isActive },
  }),
})

export async function createRoomAction(
  rawInput: unknown,
): Promise<ActionResult<RoomDto, 'name' | 'kind' | 'capacity' | 'notes'>> {
  return runCreateRoom(rawInput)
}
