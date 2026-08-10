import { describeCause } from '@/lib/observability/describe-cause'
import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isVitalsRepositoryError } from '../domain/VitalsRepository'
import { vitalsMessages } from '../schemas/vitals.schema'

export function toVitalsFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isVitalsRepositoryError(cause)) {
    console.error(`[${action}] registro de sinais vitais recusado`, {
      reason: cause.reason,
      code: cause.code ?? null,
    })

    switch (cause.reason) {
      case 'forbidden':
        return err<F>('forbidden', vitalsMessages.forbidden)
      case 'not-found':
        return err<F>('not-found', vitalsMessages.notFound)
      case 'unavailable':
        return err<F>('unavailable', vitalsMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', vitalsMessages.unexpected)
    }
  }

  console.error(`[${action}] falha não tratada`, describeCause(cause))
  return err<F>('unexpected', vitalsMessages.unexpected)
}
