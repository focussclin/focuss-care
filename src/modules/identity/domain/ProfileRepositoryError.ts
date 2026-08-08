/**
 * Falha de escrita do perfil, traduzida para o domínio.
 */
export type ProfileWriteFailure =
  /**
   * A linha de `profiles` não existe para este usuário.
   *
   * Acontece quando o gatilho que cria o perfil no cadastro não rodou. Não é
   * "não encontrado" genérico: a sessão é válida, e o que falta é a linha.
   */
  | 'not-found'
  /** A policy de RLS recusou — a sessão não pode escrever nesta linha. */
  | 'forbidden'
  /** O banco não respondeu. */
  | 'unavailable'
  /** Qualquer outra recusa. */
  | 'unexpected'

export class ProfileRepositoryError extends Error {
  readonly reason: ProfileWriteFailure
  readonly code?: string

  constructor(reason: ProfileWriteFailure, message: string, code?: string) {
    super(message)
    this.name = 'ProfileRepositoryError'
    this.reason = reason
    this.code = code
  }
}

export function isProfileRepositoryError(
  cause: unknown,
): cause is ProfileRepositoryError {
  return cause instanceof ProfileRepositoryError
}
