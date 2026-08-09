import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isRoomRepositoryError } from '../domain/RoomRepositoryError'
import { roomMessages } from '../schemas/room.schema'

export function toRoomFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isRoomRepositoryError(cause)) {
    console.error(`[${action}] operação de sala recusada`, {
      reason: cause.reason,
      code: cause.code ?? null,
    })

    switch (cause.reason) {
      case 'conflict':
        return err<F>('conflict', roomMessages.duplicate)
      case 'not-found':
        return err<F>('not-found', roomMessages.notFound)
      case 'forbidden':
        return err<F>('forbidden', roomMessages.forbidden)
      case 'schema-not-ready':
        return err<F>('unavailable', roomMessages.schemaPending)
      case 'unavailable':
        return err<F>('unavailable', roomMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', roomMessages.unexpected)
    }
  }

  console.error(`[${action}] falha não tratada`, {
    kind: cause instanceof Error ? cause.name : typeof cause,
  })

  return err<F>('unexpected', roomMessages.unexpected)
}
