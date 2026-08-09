export type PatientTagRepositoryErrorReason =
  | 'schema-not-ready'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'unavailable'
  | 'unexpected'

export class PatientTagRepositoryError extends Error {
  constructor(
    public readonly reason: PatientTagRepositoryErrorReason,
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'PatientTagRepositoryError'
  }
}

export function isPatientTagRepositoryError(
  cause: unknown,
): cause is PatientTagRepositoryError {
  return cause instanceof PatientTagRepositoryError
}
