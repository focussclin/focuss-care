export type RoomRepositoryFailure =
  | 'conflict'
  | 'not-found'
  | 'forbidden'
  | 'unavailable'
  | 'schema-not-ready'
  | 'unexpected'

export class RoomRepositoryError extends Error {
  readonly reason: RoomRepositoryFailure
  readonly code?: string

  constructor(reason: RoomRepositoryFailure, message: string, code?: string) {
    super(message)
    this.name = 'RoomRepositoryError'
    this.reason = reason
    this.code = code
  }
}

export function isRoomRepositoryError(
  cause: unknown,
): cause is RoomRepositoryError {
  return cause instanceof RoomRepositoryError
}
