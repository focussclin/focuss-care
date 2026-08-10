import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isPatientTagRepositoryError } from '../domain/PatientTagRepositoryError'
import { patientTagMessages } from '../schemas/patientTag.schema'

export function toPatientTagFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isPatientTagRepositoryError(cause)) {
    console.error(`[${action}] operação de tags recusada`, {
      reason: cause.reason,
      code: cause.code ?? null,
    })

    switch (cause.reason) {
      case 'schema-not-ready':
        return err<F>('unavailable', patientTagMessages.schemaPending)
      case 'forbidden':
        return err<F>('forbidden', patientTagMessages.forbidden)
      case 'not-found':
        return err<F>('not-found', patientTagMessages.notFound)
      case 'conflict':
        return err<F>('conflict', patientTagMessages.conflict)
      case 'unavailable':
        return err<F>('unavailable', patientTagMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', patientTagMessages.unexpected)
    }
  }

  console.error(`[${action}] falha não tratada`, {
    kind: cause instanceof Error ? cause.name : typeof cause,
  })
  return err<F>('unexpected', patientTagMessages.unexpected)
}
