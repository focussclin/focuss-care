import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isInventoryRepositoryError } from '../domain/InventoryRepositoryError'
import { inventoryMessages } from '../schemas/inventory.schema'

export function toInventoryFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isInventoryRepositoryError(cause)) {
    console.error(`[${action}] operação de estoque recusada`, {
      reason: cause.reason,
      code: cause.code ?? null,
    })

    switch (cause.reason) {
      case 'schema-not-ready':
        return err<F>('unavailable', inventoryMessages.schemaPending)
      case 'forbidden':
        return err<F>('forbidden', inventoryMessages.forbidden)
      case 'not-found':
        return err<F>('not-found', inventoryMessages.notFound)
      case 'duplicate':
        return err<F>('conflict', inventoryMessages.duplicate)
      case 'insufficient-stock':
        return err<F>('conflict', inventoryMessages.insufficientStock)
      case 'invalid-movement':
        return err<F>('validation', inventoryMessages.invalidMovement)
      case 'unavailable':
        return err<F>('unavailable', inventoryMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', inventoryMessages.unexpected)
    }
  }

  console.error(`[${action}] falha não tratada`, {
    kind: cause instanceof Error ? cause.name : typeof cause,
  })
  return err<F>('unexpected', inventoryMessages.unexpected)
}
