import { describeCause } from '@/lib/observability/describe-cause'
import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isAutomationRepositoryError } from '../domain/AutomationRepository'
import { automationMessages } from '../schemas/automation.schema'

export function toAutomationFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isAutomationRepositoryError(cause)) {
    console.error(`[${action}] operação de automação recusada`, {
      reason: cause.reason,
      code: cause.code ?? null,
    })

    switch (cause.reason) {
      case 'forbidden':
        return err<F>('forbidden', automationMessages.forbidden)
      case 'write-forbidden':
        return err<F>('forbidden', automationMessages.writeForbidden)
      /*
       * `conflict`, e a mensagem manda DESATIVAR.
       *
       * Excluir uma regra com execuções apagaria a evidência do que rodou —
       * `workflow_runs` referencia `workflows` justamente para impedir isso.
       * Dizer só "não foi possível excluir" deixaria a pessoa tentando de novo.
       */
      case 'has-runs':
        return err<F>('conflict', automationMessages.hasRuns)
      case 'not-found':
        return err<F>('not-found', automationMessages.notFound)
      case 'unavailable':
        return err<F>('unavailable', automationMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', automationMessages.unexpected)
    }
  }

  console.error(`[${action}] falha não tratada`, describeCause(cause))
  return err<F>('unexpected', automationMessages.unexpected)
}
