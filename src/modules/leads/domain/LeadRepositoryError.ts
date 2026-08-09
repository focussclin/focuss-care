export type LeadFailure =
  | 'not-found'
  | 'forbidden'
  | 'schema-not-ready'
  | 'unavailable'
  | 'unexpected'

export class LeadRepositoryError extends Error {
  readonly reason: LeadFailure
  readonly code?: string

  constructor(reason: LeadFailure, message: string, code?: string) {
    super(message)
    this.name = 'LeadRepositoryError'
    this.reason = reason
    this.code = code
  }
}

export function isLeadRepositoryError(
  cause: unknown,
): cause is LeadRepositoryError {
  return cause instanceof LeadRepositoryError
}
