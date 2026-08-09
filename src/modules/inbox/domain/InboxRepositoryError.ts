export type InboxFailure = 'forbidden' | 'unavailable' | 'unexpected'

export class InboxRepositoryError extends Error {
  readonly reason: InboxFailure
  readonly code?: string

  constructor(reason: InboxFailure, message: string, code?: string) {
    super(message)
    this.name = 'InboxRepositoryError'
    this.reason = reason
    this.code = code
  }
}

export function isInboxRepositoryError(
  cause: unknown,
): cause is InboxRepositoryError {
  return cause instanceof InboxRepositoryError
}
