export type PurchaseRepositoryErrorReason =
  | 'schema-not-ready'
  | 'forbidden'
  | 'not-found'
  | 'duplicate'
  | 'invalid'
  | 'unavailable'
  | 'unexpected'

export class PurchaseRepositoryError extends Error {
  readonly reason: PurchaseRepositoryErrorReason
  readonly code?: string

  constructor(
    reason: PurchaseRepositoryErrorReason,
    message: string,
    code?: string,
  ) {
    super(message)
    this.name = 'PurchaseRepositoryError'
    this.reason = reason
    this.code = code
  }
}

export function isPurchaseRepositoryError(
  cause: unknown,
): cause is PurchaseRepositoryError {
  return cause instanceof PurchaseRepositoryError
}
