import { describeCause } from '@/lib/observability/describe-cause'
import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isAvailabilityExceptionError } from '../domain/AvailabilityExceptionRepository'
import { availabilityMessages } from '../schemas/availabilityException.schema'

export function toAvailabilityFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isAvailabilityExceptionError(cause)) {
    console.error(`[${action}] operação de disponibilidade recusada`, {
      reason: cause.reason,
      code: cause.code ?? null,
    })

    switch (cause.reason) {
      case 'forbidden':
        return err<F>('forbidden', availabilityMessages.forbidden)
      case 'write-forbidden':
        return err<F>('forbidden', availabilityMessages.writeForbidden)
      case 'not-found':
        return err<F>('not-found', availabilityMessages.notFound)
      case 'unavailable':
        return err<F>('unavailable', availabilityMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', availabilityMessages.unexpected)
    }
  }

  console.error(`[${action}] falha não tratada`, describeCause(cause))
  return err<F>('unexpected', availabilityMessages.unexpected)
}
