/**
 * Falha de escrita do prontuário, traduzida para o domínio.
 *
 * `code` é o SQLSTATE quando existe, e serve ao LOG DO SERVIDOR. Nunca à tela —
 * e aqui a regra é mais dura que nos outros módulos: o texto de erro do Postgres
 * pode ecoar o valor enviado, e o valor enviado é conteúdo clínico.
 */

export type RecordWriteFailure =
  /**
   * A sessão não tem `professionals.id` na clínica ativa.
   *
   * Não é falta de permissão genérica: é não ser profissional. Recepção e
   * financeiro não assinam prontuário, e a mensagem precisa dizer isso — quem
   * recebe "sem permissão" tenta de novo; quem recebe "só profissional assina"
   * chama quem deve.
   */
  | 'not-a-professional'
  /** Tentativa de corrigir uma versão que já foi substituída. */
  | 'superseded'
  /** O alvo não existe — ou existe em outra clínica, o que dá no mesmo aqui. */
  | 'not-found'
  /** A policy de RLS recusou — inclui `can_access_clinical()`. */
  | 'forbidden'
  /** O banco não respondeu. */
  | 'unavailable'
  /** Qualquer outra recusa. */
  | 'unexpected'

export class MedicalRecordRepositoryError extends Error {
  readonly reason: RecordWriteFailure
  readonly code?: string

  constructor(reason: RecordWriteFailure, message: string, code?: string) {
    super(message)
    this.name = 'MedicalRecordRepositoryError'
    this.reason = reason
    this.code = code
  }
}

export function isMedicalRecordRepositoryError(
  cause: unknown,
): cause is MedicalRecordRepositoryError {
  return cause instanceof MedicalRecordRepositoryError
}
