import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isFormRepositoryError } from '../domain/FormRepositoryError'
import { formMessages } from '../schemas/form.schema'

export function toFormFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isFormRepositoryError(cause)) {
    console.error(`[${action}] operação de formulário recusada`, {
      reason: cause.reason,
      code: cause.code ?? null,
    })

    switch (cause.reason) {
      case 'not-found':
        return err<F>('not-found', formMessages.notFound)
      case 'forbidden':
        return err<F>('forbidden', formMessages.forbidden)
      case 'schema-not-ready':
        return err<F>('unavailable', formMessages.schemaPending)
      case 'unavailable':
        return err<F>('unavailable', formMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', formMessages.unexpected)
    }
  }

  console.error(`[${action}] falha não tratada`, {
    kind: cause instanceof Error ? cause.name : typeof cause,
  })
  return err<F>('unexpected', formMessages.unexpected)
}
