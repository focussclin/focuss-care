/**
 * Falha de escrita da agenda, traduzida para o domínio.
 *
 * Mesmo desenho de `PatientRepositoryError`, e pelo mesmo motivo: a action
 * precisa distinguir "horário ocupado" de "recusado pela RLS" de "erro
 * inesperado" para escolher a mensagem em pt-BR — e não pode fazer isso lendo
 * `PostgrestError`, senão o formato do Supabase atravessa a porta e o adapter
 * deixa de ser trocável.
 *
 * `code` é diagnóstico opaco (o SQLSTATE, quando existe) e serve para o LOG DO
 * SERVIDOR. Nunca para a tela: mensagem de banco cita coluna e constraint.
 */

export type AppointmentWriteFailure =
  /**
   * Já existe atendimento do mesmo profissional no intervalo.
   *
   * Depende de uma constraint de exclusão no banco. Se ela não existir, este
   * caso simplesmente não ocorre e a detecção real de conflito fica com A-02.
   */
  | 'conflict'
  /** O alvo não existe — ou existe em outra clínica, o que dá no mesmo aqui. */
  | 'not-found'
  /** A policy de RLS recusou. Sessão sem direito sobre esta clínica. */
  | 'forbidden'
  /** O banco não respondeu, ou respondeu erro de transporte. */
  | 'unavailable'
  /** Qualquer outra recusa. */
  | 'unexpected'

export class AppointmentRepositoryError extends Error {
  readonly reason: AppointmentWriteFailure
  /** SQLSTATE ou código do driver. Log do servidor apenas. */
  readonly code?: string

  constructor(reason: AppointmentWriteFailure, message: string, code?: string) {
    super(message)
    this.name = 'AppointmentRepositoryError'
    this.reason = reason
    this.code = code
  }
}

export function isAppointmentRepositoryError(
  cause: unknown,
): cause is AppointmentRepositoryError {
  return cause instanceof AppointmentRepositoryError
}
