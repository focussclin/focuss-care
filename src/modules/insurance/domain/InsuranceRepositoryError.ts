/**
 * Falha de escrita dos convênios, traduzida para o domínio.
 */
export type InsuranceWriteFailure =
  /**
   * A guia já foi respondida.
   *
   * Reescrever a resposta apagaria o motivo da negativa — que é exatamente o
   * texto usado para recorrer junto à operadora.
   */
  | 'already-answered'
  /** Já existe operadora com este nome ou registro ANS nesta clínica. */
  | 'duplicate'
  /** O alvo não existe — ou existe em outra clínica, o que dá no mesmo aqui. */
  | 'not-found'
  /** A policy de RLS recusou. */
  | 'forbidden'
  /** O banco não respondeu. */
  | 'unavailable'
  /** Qualquer outra recusa. */
  | 'unexpected'

export class InsuranceRepositoryError extends Error {
  readonly reason: InsuranceWriteFailure
  readonly code?: string

  constructor(reason: InsuranceWriteFailure, message: string, code?: string) {
    super(message)
    this.name = 'InsuranceRepositoryError'
    this.reason = reason
    this.code = code
  }
}

export function isInsuranceRepositoryError(
  cause: unknown,
): cause is InsuranceRepositoryError {
  return cause instanceof InsuranceRepositoryError
}
