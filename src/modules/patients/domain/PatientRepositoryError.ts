/**
 * Falha de escrita do repositorio de pacientes, traduzida para o dominio.
 *
 * Existe por uma razao so: a action precisa distinguir "conflito" de "recusado
 * pela RLS" de "erro inesperado" para escolher a mensagem em pt-BR — e nao pode
 * fazer isso lendo `PostgrestError`, porque ai o formato do Supabase atravessaria
 * a porta e o adapter deixaria de ser trocavel.
 *
 * `code` e um diagnostico opaco (o SQLSTATE, quando existe). Serve para o LOG DO
 * SERVIDOR. Nunca para a tela: a §4 de docs/06-acoes-e-auditoria.md e explicita —
 * mensagem de banco pode citar coluna e constraint.
 */

export type PatientWriteFailure =
  /** Ja existe registro que impede a escrita (unique violation). */
  | 'conflict'
  /** O alvo nao existe — ou existe em outra clinica, o que da no mesmo aqui. */
  | 'not-found'
  /** A policy de RLS recusou. Sessao sem direito sobre esta clinica. */
  | 'forbidden'
  /** O banco nao respondeu, ou respondeu erro de transporte. */
  | 'unavailable'
  /** Qualquer outra recusa. */
  | 'unexpected'

export class PatientRepositoryError extends Error {
  readonly reason: PatientWriteFailure
  /** SQLSTATE ou codigo do driver. Log do servidor apenas. */
  readonly code?: string

  constructor(reason: PatientWriteFailure, message: string, code?: string) {
    super(message)
    this.name = 'PatientRepositoryError'
    this.reason = reason
    this.code = code
  }
}

export function isPatientRepositoryError(
  cause: unknown,
): cause is PatientRepositoryError {
  return cause instanceof PatientRepositoryError
}
