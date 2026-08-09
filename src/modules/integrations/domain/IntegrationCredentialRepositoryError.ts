export type IntegrationCredentialRepositoryFailure =
  | 'schema-not-ready'
  | 'vault-not-configured'
  | 'unavailable'
  | 'unexpected'

export class IntegrationCredentialRepositoryError extends Error {
  constructor(
    readonly reason: IntegrationCredentialRepositoryFailure,
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'IntegrationCredentialRepositoryError'
  }
}

export function isIntegrationCredentialRepositoryError(
  cause: unknown,
): cause is IntegrationCredentialRepositoryError {
  return cause instanceof IntegrationCredentialRepositoryError
}
