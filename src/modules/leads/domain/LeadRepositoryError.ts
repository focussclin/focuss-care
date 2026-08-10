export type LeadFailure =
  | 'not-found'
  | 'forbidden'
  /**
   * O lead já virou paciente.
   *
   * Razão própria porque a AÇÃO é outra: não é "tente de novo", é "abra a ficha
   * que já existe". Colapsá-la em `unexpected` faria o segundo clique acusar
   * falha sobre uma operação que deu certo — e alguém cadastraria o paciente à
   * mão, duplicando a pessoa.
   */
  | 'already-converted'
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
