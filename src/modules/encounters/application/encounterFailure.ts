import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isEncounterRepositoryError } from '../domain/EncounterRepositoryError'
import { encounterMessages } from '../schemas/encounter.schema'

/**
 * Falha de escrita do atendimento -> `Result` com mensagem em pt-BR.
 *
 * Um lugar só para as quatro actions do módulo. A regra que importa aqui não é
 * o `switch`: é o que vai para o log.
 *
 * **O log recebe apenas `reason` e `code`.** `waiting_queue.reason` é texto
 * livre da recepção e costuma trazer a queixa ("dor no peito"), e o texto de
 * erro do Postgres pode ecoar valores enviados. Carregar `details`/`hint` para
 * o log — lido por muito mais gente que a tabela — arrastaria dado de saúde
 * junto.
 *
 * `invalid-transition` sai como `'conflict'`: para o pipeline, é a mesma classe
 * de "o estado mudou debaixo de você", e a mensagem já diz para atualizar.
 */
export function toEncounterFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isEncounterRepositoryError(cause)) {
    console.error(`[${action}] escrita recusada`, {
      reason: cause.reason,
      code: cause.code,
    })

    switch (cause.reason) {
      case 'invalid-transition':
        return err<F>('conflict', encounterMessages.invalidTransition)
      case 'not-found':
        return err<F>('not-found', encounterMessages.notFound)
      case 'forbidden':
        return err<F>('forbidden', encounterMessages.forbidden)
      case 'unavailable':
        return err<F>('unavailable', encounterMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', encounterMessages.unexpected)
    }
  }

  console.error(`[${action}] falha nao tratada`, {
    kind: cause instanceof Error ? cause.name : typeof cause,
  })

  return err<F>('unexpected', encounterMessages.unexpected)
}
