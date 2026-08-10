import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isFormResponseRepositoryError } from '../domain/FormResponseRepositoryError'
import { formResponseMessages } from '../schemas/formResponse.schema'

export function toFormResponseFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isFormResponseRepositoryError(cause)) {
    console.error(`[${action}] operação de resposta recusada`, {
      reason: cause.reason,
      code: cause.code ?? null,
    })

    switch (cause.reason) {
      case 'not-found':
        return err<F>('not-found', formResponseMessages.notFound)
      case 'forbidden':
        return err<F>('forbidden', formResponseMessages.forbidden)
      case 'schema-not-ready':
        return err<F>('unavailable', formResponseMessages.schemaPending)
      case 'conflict':
        return err<F>('conflict', formResponseMessages.conflict)
      case 'unavailable':
        return err<F>('unavailable', formResponseMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', formResponseMessages.unexpected)
    }
  }

  console.error(`[${action}] falha não tratada`, {
    kind: cause instanceof Error ? cause.name : typeof cause,
  })
  return err<F>('unexpected', formResponseMessages.unexpected)
}
