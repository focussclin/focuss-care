import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isDocumentRepositoryError } from '../domain/DocumentRepositoryError'
import { documentMessages } from '../schemas/document.schema'

export function toDocumentFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isDocumentRepositoryError(cause)) {
    console.error(`[${action}] operação de documentos recusada`, {
      reason: cause.reason,
      code: cause.code ?? null,
    })

    switch (cause.reason) {
      case 'schema-not-ready':
        return err<F>('unavailable', documentMessages.schemaPending)
      case 'storage-not-ready':
        return err<F>('unavailable', documentMessages.storagePending)
      case 'forbidden':
        return err<F>('forbidden', documentMessages.forbidden)
      case 'not-found':
        return err<F>('not-found', documentMessages.notFound)
      case 'unavailable':
        return err<F>('unavailable', documentMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', documentMessages.unexpected)
    }
  }

  console.error(`[${action}] falha não tratada`, {
    kind: cause instanceof Error ? cause.name : typeof cause,
  })
  return err<F>('unexpected', documentMessages.unexpected)
}
