/**
 * Falha de escrita da equipe, traduzida para o domínio.
 *
 * Os dois primeiros motivos não são erro: são o sistema recusando uma operação
 * que deixaria a clínica sem quem a administre. Merecem código próprio porque
 * a mensagem que o usuário precisa ler é diferente de "não foi possível".
 */

export type TeamWriteFailure =
  /**
   * Tentativa de revogar o próprio acesso.
   *
   * Quem clica errado se tranca para fora, e só outro administrador poderia
   * trazer de volta — numa clínica de dois, isso é um chamado de suporte.
   */
  | 'self-revoke'
  /**
   * Tentativa de revogar ou rebaixar o último `owner`.
   *
   * Uma clínica sem dono não tem quem gerencie a equipe nem quem responda pela
   * assinatura, e o caminho de volta exige mexer direto no banco.
   */
  | 'last-owner'
  /**
   * Tentativa de CONCEDER um papel que quem age nao possui.
   *
   * `admin` tem `team.manage` e nao tem `record.read` — a matriz de permissoes
   * exclui `admin` de CLINICAL de proposito, como controle de LGPD. Sem esta
   * recusa, um `admin` se promove a `owner` (ou convida um `owner` que ele
   * controla) e passa a ler o prontuario de todo mundo. O controle existia e
   * era contornavel por quem ele restringia.
   */
  | 'role-escalation'
  /**
   * Desligamento anterior à admissão — período negativo.
   *
   * Duas recusas separadas, e não uma "data inválida": quem lê precisa saber
   * QUAL das duas datas conferir. Ver `refuseTermination`.
   */
  | 'termination-before-hire'
  /**
   * Desligamento no futuro.
   *
   * A que surpreende: aviso prévio é rotina, e é justamente o que este produto
   * não pode prometer. Sem worker que vire o vínculo no dia marcado, aceitar
   * data futura tiraria a pessoa da equipe hoje, enquanto ela ainda trabalha.
   */
  | 'termination-in-future'
  | 'hire-after-termination'
  /** O alvo não existe — ou existe em outra clínica, o que dá no mesmo aqui. */
  | 'not-found'
  /** A policy de RLS recusou. */
  | 'forbidden'
  /** O banco não respondeu. */
  | 'unavailable'
  /** Qualquer outra recusa. */
  | 'unexpected'

export class TeamRepositoryError extends Error {
  readonly reason: TeamWriteFailure
  readonly code?: string

  constructor(reason: TeamWriteFailure, message: string, code?: string) {
    super(message)
    this.name = 'TeamRepositoryError'
    this.reason = reason
    this.code = code
  }
}

export function isTeamRepositoryError(
  cause: unknown,
): cause is TeamRepositoryError {
  return cause instanceof TeamRepositoryError
}
