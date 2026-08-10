import { describeCause } from '@/lib/observability/describe-cause'
import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isPriceListError } from '../domain/PriceListRepository'
import { priceListMessages } from '../schemas/priceList.schema'

export function toPriceListFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isPriceListError(cause)) {
    console.error(`[${action}] operação de tabela de preço recusada`, {
      reason: cause.reason,
      code: cause.code ?? null,
    })

    switch (cause.reason) {
      case 'forbidden':
        return err<F>('forbidden', priceListMessages.forbidden)
      case 'write-forbidden':
        return err<F>('forbidden', priceListMessages.writeForbidden)
      case 'duplicate':
        return err<F>('conflict', priceListMessages.duplicateService)
      case 'not-found':
        return err<F>('not-found', priceListMessages.notFound)
      case 'unavailable':
        return err<F>('unavailable', priceListMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', priceListMessages.unexpected)
    }
  }

  console.error(`[${action}] falha não tratada`, describeCause(cause))
  return err<F>('unexpected', priceListMessages.unexpected)
}
