export type TaskFailure =
  | 'not-found'
  | 'forbidden'
  | 'schema-not-ready'
  | 'unavailable'
  | 'unexpected'

/**
 * Falha do repositório traduzida para o domínio.
 *
 * `schema-not-ready` existe pelo mesmo motivo que em `rooms`: enquanto
 * `20260809_clinic_tasks.sql` não for aplicada, o PostgREST responde que a
 * relação não existe — e isso é uma pendência de infraestrutura, não um erro
 * que o usuário causou. Traduzi-la para "algo deu errado" mandaria a recepção
 * tentar de novo para sempre.
 */
export class TaskRepositoryError extends Error {
  readonly reason: TaskFailure
  /** SQLSTATE ou código do driver. Log do servidor apenas. */
  readonly code?: string

  constructor(reason: TaskFailure, message: string, code?: string) {
    super(message)
    this.name = 'TaskRepositoryError'
    this.reason = reason
    this.code = code
  }
}

export function isTaskRepositoryError(
  cause: unknown,
): cause is TaskRepositoryError {
  return cause instanceof TaskRepositoryError
}
