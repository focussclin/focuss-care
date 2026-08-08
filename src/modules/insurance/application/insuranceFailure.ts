import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isInsuranceRepositoryError } from '../domain/InsuranceRepositoryError'
import { insuranceMessages } from '../schemas/insurance.schema'

/**
 * Falha de escrita dos convênios -> `Result` com mensagem em pt-BR.
 *
 * **O log recebe apenas `reason` e `code`.** A mensagem do Postgres pode ecoar
 * valores enviados, e entre eles está o número da carteirinha — dado pessoal do
 * paciente, e log é lido por muito mais gente que a tabela.
 */
export function toInsuranceFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isInsuranceRepositoryError(cause)) {
    console.error(`[${action}] escrita recusada`, {
      reason: cause.reason,
      code: cause.code,
    })

    switch (cause.reason) {
      case 'already-answered':
        return err<F>('conflict', insuranceMessages.alreadyAnswered)
      case 'duplicate':
        return err<F>('conflict', insuranceMessages.duplicate)
      case 'not-found':
        return err<F>('not-found', insuranceMessages.notFound)
      case 'forbidden':
        return err<F>('forbidden', insuranceMessages.forbidden)
      case 'unavailable':
        return err<F>('unavailable', insuranceMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', insuranceMessages.unexpected)
    }
  }

  console.error(`[${action}] falha nao tratada`, {
    kind: cause instanceof Error ? cause.name : typeof cause,
  })

  return err<F>('unexpected', insuranceMessages.unexpected)
}
