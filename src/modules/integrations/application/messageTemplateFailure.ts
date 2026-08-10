import { describeCause } from '@/lib/observability/describe-cause'
import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isMessageTemplateError } from '../domain/MessageTemplateRepository'
import { messageTemplateMessages } from '../schemas/messageTemplate.schema'

export function toMessageTemplateFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isMessageTemplateError(cause)) {
    console.error(`[${action}] operação de modelo recusada`, {
      reason: cause.reason,
      code: cause.code ?? null,
    })

    switch (cause.reason) {
      case 'forbidden':
        return err<F>('forbidden', messageTemplateMessages.forbidden)
      case 'write-forbidden':
        return err<F>('forbidden', messageTemplateMessages.writeForbidden)
      case 'duplicate':
        return err<F>('conflict', messageTemplateMessages.duplicateName)
      case 'not-found':
        return err<F>('not-found', messageTemplateMessages.notFound)
      case 'unavailable':
        return err<F>('unavailable', messageTemplateMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', messageTemplateMessages.unexpected)
    }
  }

  console.error(`[${action}] falha não tratada`, describeCause(cause))
  return err<F>('unexpected', messageTemplateMessages.unexpected)
}
