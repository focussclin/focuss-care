/**
 * Falha de escrita do financeiro, traduzida para o domínio.
 *
 * As três primeiras não são erro de sistema: são o financeiro recusando uma
 * operação que deixaria o registro mentindo sobre dinheiro.
 */
export type BillingWriteFailure =
  /**
   * Pagamento acima do saldo devedor.
   *
   * Quase sempre é erro de digitação — R$ 1.000 no lugar de R$ 100. Aceitá-lo
   * criaria um crédito que o sistema não sabe devolver, e o paciente
   * descobriria na próxima cobrança.
   */
  | 'overpayment'
  /**
   * Tentativa de cancelar cobrança que já recebeu pagamento.
   *
   * Dinheiro que entrou não desaparece porque alguém cancelou a cobrança. O
   * caminho correto é o estorno, que exige uma decisão que esta fatia não toma.
   */
  | 'invoice-paid'
  /** Tentativa de baixar uma despesa que já foi baixada. */
  | 'payable-paid'
  /** Já existe caixa aberto, ou não existe nenhum para a operação pedida. */
  | 'cash-session-conflict'
  /** O alvo não existe — ou existe em outra clínica, o que dá no mesmo aqui. */
  | 'not-found'
  /** A policy de RLS recusou. */
  | 'forbidden'
  /** O banco não respondeu. */
  | 'unavailable'
  /** Qualquer outra recusa. */
  | 'unexpected'

export class BillingRepositoryError extends Error {
  readonly reason: BillingWriteFailure
  readonly code?: string

  constructor(reason: BillingWriteFailure, message: string, code?: string) {
    super(message)
    this.name = 'BillingRepositoryError'
    this.reason = reason
    this.code = code
  }
}

export function isBillingRepositoryError(
  cause: unknown,
): cause is BillingRepositoryError {
  return cause instanceof BillingRepositoryError
}
