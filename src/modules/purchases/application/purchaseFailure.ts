import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { PurchaseRepositoryError } from '../domain/PurchaseRepositoryError'
import { purchaseMessages } from '../schemas/purchase.schema'

export function toPurchaseFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (cause instanceof PurchaseRepositoryError) {
    switch (cause.reason) {
      case 'schema-not-ready':
        return err<F>('unavailable', purchaseMessages.schemaPending)
      case 'forbidden':
        return err<F>('forbidden', purchaseMessages.forbidden)
      case 'not-found':
        return err<F>('not-found', purchaseMessages.notFound)
      case 'duplicate':
        return err<F>('conflict', purchaseMessages.duplicate)
      case 'invalid':
        return err<F>('validation', purchaseMessages.statusInvalid)
      case 'unavailable':
        return err<F>('unavailable', purchaseMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', purchaseMessages.unexpected)
    }
  }

  console.error(`[${action}] operação de compras recusada`, cause)
  return err<F>('unexpected', purchaseMessages.unexpected)
}
