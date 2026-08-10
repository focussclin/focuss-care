import { describeCause } from '@/lib/observability/describe-cause'
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

  /*
   * `describeCause`, e não o objeto cru.
   *
   * Não é para esconder `details`/`hint` — eles vão junto de propósito, e é o
   * que diz qual constraint recusou. É porque `cause` aqui é `unknown`: pode
   * ser um `Error`, um `PostgrestError`, ou qualquer coisa que alguém lançou.
   * Despejar o objeto inteiro no log significa não saber, de antemão, o que
   * vai parar nele. `describeCause` tem lista fechada de campos, e é o padrão
   * do resto do produto.
   */
  console.error(`[${action}] operação de compras recusada`, describeCause(cause))
  return err<F>('unexpected', purchaseMessages.unexpected)
}
