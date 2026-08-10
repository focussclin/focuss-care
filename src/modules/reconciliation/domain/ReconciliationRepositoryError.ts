export type ReconciliationRepositoryErrorReason =
  | 'schema-not-ready'
  | 'forbidden'
  | 'not-found'
  | 'duplicate'
  | 'invalid'
  /**
   * A transação já saiu de `pending` — quase sempre porque outra pessoa a
   * conciliou primeiro.
   *
   * Vinha junto de `invalid`, e as duas viravam "selecione uma fatura ou
   * despesa". Quem esbarrava nisso trocava de alvo e tentava de novo, para
   * sempre: nenhum alvo ia resolver, porque o problema nunca esteve no alvo.
   */
  | 'already-processed'
  /**
   * Entrada casada com despesa, ou saída casada com fatura.
   *
   * A regra é do banco (`v_transaction.direction <> 'credit'`) e a tela já
   * filtra os candidatos pelo sentido — então isto só aparece quando a tela e
   * o banco discordam, e dizer "selecione um registro" esconderia justamente
   * essa discordância.
   */
  | 'direction-mismatch'
  | 'unavailable'
  | 'unexpected'

export class ReconciliationRepositoryError extends Error {
  readonly reason: ReconciliationRepositoryErrorReason
  readonly code?: string

  constructor(reason: ReconciliationRepositoryErrorReason, message: string, code?: string) {
    super(message)
    this.name = 'ReconciliationRepositoryError'
    this.reason = reason
    this.code = code
  }
}

export function isReconciliationRepositoryError(cause: unknown): cause is ReconciliationRepositoryError {
  return cause instanceof ReconciliationRepositoryError
}
