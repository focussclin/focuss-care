export type FormResponseRepositoryErrorReason =
  | 'schema-not-ready'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'unavailable'
  | 'unexpected'

export class FormResponseRepositoryError extends Error {
  constructor(
    public readonly reason: FormResponseRepositoryErrorReason,
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'FormResponseRepositoryError'
  }
}

export function isFormResponseRepositoryError(
  cause: unknown,
): cause is FormResponseRepositoryError {
  return cause instanceof FormResponseRepositoryError
}
