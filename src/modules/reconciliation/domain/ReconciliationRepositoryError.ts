export type ReconciliationRepositoryErrorReason =
  | 'schema-not-ready'
  | 'forbidden'
  | 'not-found'
  | 'duplicate'
  | 'invalid'
  | 'unavailable'
  | 'unexpected'

export class ReconciliationRepositoryError extends Error {
  readonly reason: ReconciliationRepositoryErrorReason
  readonly code?: string

  constructor(reason: ReconciliationRepositoryErrorReason, message: string, code?: string) {
    super(message)
    this.name = 'ReconciliationRepositoryError'
    this.reason = reason
    this.code = code
  }
}

export function isReconciliationRepositoryError(cause: unknown): cause is ReconciliationRepositoryError {
  return cause instanceof ReconciliationRepositoryError
}
