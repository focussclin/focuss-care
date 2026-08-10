import { describeCause } from '@/lib/observability/describe-cause'
import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isInboxRepositoryError } from '../domain/InboxRepositoryError'
import { inboxMessages } from '../schemas/inbox.schema'

export function toInboxFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isInboxRepositoryError(cause)) {
    console.error(`[${action}] operação da inbox recusada`, {
      reason: cause.reason,
      code: cause.code ?? null,
    })

    switch (cause.reason) {
      case 'forbidden':
        return err<F>('forbidden', inboxMessages.forbidden)
      /*
       * Mensagem própria, e não a de `forbidden`.
       *
       * Aqui a leitura funcionou e a escrita não — quase sempre porque falta
       * policy de UPDATE em `conversations` para o papel. Quem lê a tela precisa
       * saber que o problema é do banco e não da conversa, senão vai tentar de
       * novo indefinidamente numa linha que está bem ali na lista.
       */
      case 'write-forbidden':
        return err<F>('forbidden', inboxMessages.writeForbidden)
      /*
       * `conflict`, e nao `not-found`: a conversa existe e a permissao esta
       * certa — outra pessoa chegou primeiro. Mandar procurar uma conversa que
       * esta na tela seria mandar caçar o problema errado.
       */
      case 'stale':
        return err<F>('conflict', inboxMessages.stale)
      case 'not-found':
        return err<F>('not-found', inboxMessages.notFound)
      case 'unavailable':
        return err<F>('unavailable', inboxMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', inboxMessages.unexpected)
    }
  }

  console.error(`[${action}] falha não tratada`, describeCause(cause))
  return err<F>('unexpected', inboxMessages.unexpected)
}
