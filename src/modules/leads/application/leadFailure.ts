import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isLeadRepositoryError } from '../domain/LeadRepositoryError'
import { leadMessages } from '../schemas/lead.schema'

export function toLeadFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isLeadRepositoryError(cause)) {
    console.error(`[${action}] operação de lead recusada`, {
      reason: cause.reason,
      code: cause.code ?? null,
    })

    switch (cause.reason) {
      case 'not-found':
        return err<F>('not-found', leadMessages.notFound)
      case 'forbidden':
        return err<F>('forbidden', leadMessages.forbidden)
      /*
       * `conflict`, e não `unexpected`: a operação não pode acontecer porque já
       * aconteceu. A mensagem manda abrir a ficha em vez de tentar de novo.
       */
      case 'already-converted':
        return err<F>('conflict', leadMessages.alreadyConverted)
      case 'schema-not-ready':
        return err<F>('unavailable', leadMessages.schemaPending)
      case 'unavailable':
        return err<F>('unavailable', leadMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', leadMessages.unexpected)
    }
  }

  console.error(`[${action}] falha não tratada`, {
    kind: cause instanceof Error ? cause.name : typeof cause,
  })
  return err<F>('unexpected', leadMessages.unexpected)
}
