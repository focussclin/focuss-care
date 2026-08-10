import { describeCause } from '@/lib/observability/describe-cause'
import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isPrescriptionRepositoryError } from '../domain/PrescriptionRepository'
import { prescriptionMessages } from '../schemas/prescription.schema'

export function toPrescriptionFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isPrescriptionRepositoryError(cause)) {
    console.error(`[${action}] prescrição recusada`, {
      reason: cause.reason,
      code: cause.code ?? null,
    })

    switch (cause.reason) {
      case 'forbidden':
        return err<F>('forbidden', prescriptionMessages.forbidden)
      case 'not-found':
        return err<F>('not-found', prescriptionMessages.notFound)
      case 'unavailable':
        return err<F>('unavailable', prescriptionMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', prescriptionMessages.unexpected)
    }
  }

  console.error(`[${action}] falha não tratada`, describeCause(cause))
  return err<F>('unexpected', prescriptionMessages.unexpected)
}
