import { describeCause } from '@/lib/observability/describe-cause'
import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isServiceRepositoryError } from '../domain/ServiceRepository'
import { serviceMessages } from '../schemas/service.schema'

export function toServiceFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isServiceRepositoryError(cause)) {
    console.error(`[${action}] operação do catálogo recusada`, {
      reason: cause.reason,
      code: cause.code ?? null,
    })

    switch (cause.reason) {
      case 'forbidden':
        return err<F>('forbidden', serviceMessages.forbidden)
      case 'write-forbidden':
        return err<F>('forbidden', serviceMessages.writeForbidden)
      case 'duplicate':
        return err<F>('conflict', serviceMessages.duplicateCode)
      case 'not-found':
        return err<F>('not-found', serviceMessages.notFound)
      case 'unavailable':
        return err<F>('unavailable', serviceMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', serviceMessages.unexpected)
    }
  }

  console.error(`[${action}] falha não tratada`, describeCause(cause))
  return err<F>('unexpected', serviceMessages.unexpected)
}
