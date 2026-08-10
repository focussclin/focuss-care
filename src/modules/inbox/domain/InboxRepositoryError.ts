export type InboxFailure =
  | 'forbidden'
  /**
   * A conversa e legivel, mas o UPDATE nao alcancou a linha.
   *
   * Distinto de `not-found` de proposito. Sem policy de UPDATE para o papel, o
   * Postgres nao devolve erro: zero linhas mudam, em silencio. Chamar isso de
   * "nao encontrado" mandaria a pessoa procurar uma conversa que esta ali na
   * lista, escondendo que a causa e permissao.
   */
  | 'write-forbidden'
  /**
   * A conversa mudou de estado entre a leitura e a escrita.
   *
   * Distinto de `not-found` (a linha sumiu) e de `write-forbidden` (a policy
   * recusou). Aqui esta tudo certo com a permissao e com a conversa: outra
   * pessoa chegou primeiro. Chamar isso de "nao encontrado" mandaria procurar
   * uma conversa que esta na tela; chamar de erro inesperado esconderia que a
   * saida e simplesmente recarregar.
   */
  | 'stale'
  | 'not-found'
  | 'unavailable'
  | 'unexpected'

export class InboxRepositoryError extends Error {
  readonly reason: InboxFailure
  readonly code?: string

  constructor(reason: InboxFailure, message: string, code?: string) {
    super(message)
    this.name = 'InboxRepositoryError'
    this.reason = reason
    this.code = code
  }
}

export function isInboxRepositoryError(
  cause: unknown,
): cause is InboxRepositoryError {
  return cause instanceof InboxRepositoryError
}
