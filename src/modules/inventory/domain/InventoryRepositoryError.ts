export type InventoryRepositoryErrorReason =
  | 'schema-not-ready'
  | 'forbidden'
  | 'not-found'
  | 'duplicate'
  | 'insufficient-stock'
  | 'invalid-movement'
  | 'unavailable'
  | 'unexpected'

export class InventoryRepositoryError extends Error {
  constructor(
    public readonly reason: InventoryRepositoryErrorReason,
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'InventoryRepositoryError'
  }
}

export function isInventoryRepositoryError(
  cause: unknown,
): cause is InventoryRepositoryError {
  return cause instanceof InventoryRepositoryError
}
