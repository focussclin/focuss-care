import { describeCause } from '@/lib/observability/describe-cause'
import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isAllergyRepositoryError } from '../domain/AllergyRepository'
import { allergyMessages } from '../schemas/allergy.schema'

export function toAllergyFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isAllergyRepositoryError(cause)) {
    console.error(`[${action}] operação de alergia recusada`, {
      reason: cause.reason,
      code: cause.code ?? null,
    })

    switch (cause.reason) {
      case 'forbidden':
        return err<F>('forbidden', allergyMessages.forbidden)
      case 'write-forbidden':
        return err<F>('forbidden', allergyMessages.writeForbidden)
      /*
       * `conflict`, e a mensagem manda EDITAR a entrada existente.
       *
       * Duas linhas para a mesma substância deixam quem lê sem saber qual vale,
       * e a leitura apressada pega a primeira. "Já existe" sem dizer o que fazer
       * levaria a pessoa a inventar uma variação do nome para conseguir salvar.
       */
      case 'duplicate':
        return err<F>('conflict', allergyMessages.duplicate)
      case 'not-found':
        return err<F>('not-found', allergyMessages.notFound)
      case 'unavailable':
        return err<F>('unavailable', allergyMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', allergyMessages.unexpected)
    }
  }

  console.error(`[${action}] falha não tratada`, describeCause(cause))
  return err<F>('unexpected', allergyMessages.unexpected)
}
