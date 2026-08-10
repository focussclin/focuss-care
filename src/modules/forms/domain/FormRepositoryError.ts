export type FormRepositoryErrorReason =
  | 'schema-not-ready'
  | 'forbidden'
  | 'not-found'
  | 'unavailable'
  | 'unexpected'

export class FormRepositoryError extends Error {
  constructor(
    public readonly reason: FormRepositoryErrorReason,
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'FormRepositoryError'
  }
}

export function isFormRepositoryError(
  cause: unknown,
): cause is FormRepositoryError {
  return cause instanceof FormRepositoryError
}
