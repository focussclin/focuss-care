import { describeCause } from '@/lib/observability/describe-cause'
import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { ReconciliationRepositoryError } from '../domain/ReconciliationRepositoryError'
import { reconciliationMessages } from '../schemas/reconciliation.schema'

export function toReconciliationFailure<F extends string>(action: string, cause: unknown): ActionResult<never, F> {
  if (cause instanceof ReconciliationRepositoryError) {
    switch (cause.reason) {
      case 'schema-not-ready': return err<F>('unavailable', reconciliationMessages.schemaPending)
      case 'forbidden': return err<F>('forbidden', reconciliationMessages.forbidden)
      case 'not-found': return err<F>('not-found', reconciliationMessages.notFound)
      case 'duplicate': return err<F>('conflict', reconciliationMessages.duplicate)
      case 'invalid': return err<F>('validation', reconciliationMessages.targetRequired)
      case 'unavailable': return err<F>('unavailable', reconciliationMessages.unavailable)
      case 'unexpected': return err<F>('unexpected', reconciliationMessages.unexpected)
    }
  }

  // Lista fechada de campos, como no resto do produto. Ver `purchaseFailure`.
  console.error(
    `[${action}] operação de conciliação recusada`,
    describeCause(cause),
  )
  return err<F>('unexpected', reconciliationMessages.unexpected)
}
