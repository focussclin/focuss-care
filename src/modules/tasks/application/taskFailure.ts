import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isTaskRepositoryError } from '../domain/TaskRepositoryError'
import { taskMessages } from '../schemas/task.schema'

export function toTaskFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isTaskRepositoryError(cause)) {
    console.error(`[${action}] operação de tarefa recusada`, {
      reason: cause.reason,
      code: cause.code ?? null,
    })

    switch (cause.reason) {
      case 'not-found':
        return err<F>('not-found', taskMessages.notFound)
      case 'forbidden':
        return err<F>('forbidden', taskMessages.forbidden)
      case 'schema-not-ready':
        return err<F>('unavailable', taskMessages.schemaPending)
      case 'unavailable':
        return err<F>('unavailable', taskMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', taskMessages.unexpected)
    }
  }

  console.error(`[${action}] falha não tratada`, {
    kind: cause instanceof Error ? cause.name : typeof cause,
  })

  return err<F>('unexpected', taskMessages.unexpected)
}
