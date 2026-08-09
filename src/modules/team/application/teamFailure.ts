import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isTeamRepositoryError } from '../domain/TeamRepositoryError'
import { teamMessages } from '../schemas/team.schema'

/**
 * Falha de escrita da equipe -> `Result` com mensagem em pt-BR.
 *
 * **O log recebe apenas `reason` e `code`.** Em `memberships` e `profiles` o
 * texto de erro do Postgres pode ecoar e-mail e nome de pessoa — dado pessoal,
 * ainda que não clínico, e log é lido por muito mais gente que a tabela.
 *
 * `self-revoke` e `last-owner` saem como `'conflict'`: para o pipeline são a
 * mesma classe de "o estado não permite esta operação", e as mensagens já
 * dizem o que fazer.
 */
export function toTeamFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isTeamRepositoryError(cause)) {
    console.error(`[${action}] escrita recusada`, {
      reason: cause.reason,
      code: cause.code,
    })

    switch (cause.reason) {
      case 'self-revoke':
        return err<F>('conflict', teamMessages.selfRevoke)
      case 'role-escalation':
        return err<F>('forbidden', teamMessages.roleEscalation)
      case 'last-owner':
        return err<F>('conflict', teamMessages.lastOwner)
      case 'not-found':
        return err<F>('not-found', teamMessages.notFound)
      case 'forbidden':
        return err<F>('forbidden', teamMessages.forbidden)
      case 'unavailable':
        return err<F>('unavailable', teamMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', teamMessages.unexpected)
    }
  }

  console.error(`[${action}] falha nao tratada`, {
    kind: cause instanceof Error ? cause.name : typeof cause,
  })

  return err<F>('unexpected', teamMessages.unexpected)
}
