/**
 * Falha de escrita do atendimento, traduzida para o domínio.
 *
 * Mesmo desenho dos outros módulos: a action precisa distinguir as classes de
 * recusa para escolher a mensagem em pt-BR, e não pode fazer isso lendo
 * `PostgrestError` — senão o formato do Supabase atravessa a porta.
 *
 * `code` é o SQLSTATE quando existe, e serve ao LOG DO SERVIDOR. Nunca à tela.
 */

export type EncounterWriteFailure =
  /**
   * A transição pedida não vale para o estado atual.
   *
   * Chamar quem já está em atendimento, iniciar quem já saiu, encerrar duas
   * vezes. Não é erro do sistema: é a fila tendo andado enquanto a tela de
   * alguém estava parada — duas recepcionistas, dois navegadores.
   */
  | 'invalid-transition'
  /** O alvo não existe — ou existe em outra clínica, o que dá no mesmo aqui. */
  | 'not-found'
  /** A policy de RLS recusou. */
  | 'forbidden'
  /** O banco não respondeu. */
  | 'unavailable'
  /** Qualquer outra recusa. */
  | 'unexpected'

export class EncounterRepositoryError extends Error {
  readonly reason: EncounterWriteFailure
  readonly code?: string

  constructor(reason: EncounterWriteFailure, message: string, code?: string) {
    super(message)
    this.name = 'EncounterRepositoryError'
    this.reason = reason
    this.code = code
  }
}

export function isEncounterRepositoryError(
  cause: unknown,
): cause is EncounterRepositoryError {
  return cause instanceof EncounterRepositoryError
}
