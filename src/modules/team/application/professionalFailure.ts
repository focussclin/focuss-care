import { describeCause } from '@/lib/observability/describe-cause'
import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isProfessionalError } from '../domain/ProfessionalRepository'
import { professionalMessages } from '../schemas/professional.schema'

export function toProfessionalFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isProfessionalError(cause)) {
    console.error(`[${action}] operação de profissional recusada`, {
      reason: cause.reason,
      code: cause.code ?? null,
    })

    switch (cause.reason) {
      case 'forbidden':
        return err<F>('forbidden', professionalMessages.forbidden)
      case 'write-forbidden':
        return err<F>('forbidden', professionalMessages.writeForbidden)
      case 'user-already-linked':
        return err<F>('conflict', professionalMessages.userAlreadyLinked)
      case 'not-found':
        return err<F>('not-found', professionalMessages.notFound)
      case 'unavailable':
        return err<F>('unavailable', professionalMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', professionalMessages.unexpected)
    }
  }

  console.error(`[${action}] falha não tratada`, describeCause(cause))
  return err<F>('unexpected', professionalMessages.unexpected)
}
