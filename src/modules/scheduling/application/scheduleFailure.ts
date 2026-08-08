import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isAppointmentRepositoryError } from '../domain/AppointmentRepositoryError'

/**
 * Falha de escrita da agenda -> `Result` com mensagem em pt-BR.
 *
 * Um lugar só para as três actions do módulo. A parte que importa aqui não é o
 * `switch`: é a regra sobre o que vai para o log.
 *
 * **O log recebe apenas `reason` e `code`.** `appointments.internal_notes` e
 * `cancel_reason` são texto livre digitado pela recepção e podem citar o
 * paciente pelo nome ou pelo motivo clínico da consulta. O texto do erro do
 * Postgres pode ecoar valores enviados, então carregar `details`/`hint` para o
 * log — lido por muito mais gente que a tabela — arrastaria dado de saúde junto.
 * Código e classe de recusa bastam para saber o que houve.
 *
 * Diferente de `writeFailure.ts` do módulo de pacientes num ponto: aqui não há
 * `unstable_rethrow`. As actions de agenda não chamam `redirect()` nem
 * `notFound()` de dentro do handler — o `createAction` já proíbe isso —, então
 * não há exceção de controle de fluxo do Next para deixar passar, e a camada
 * fica sem importar framework nenhum.
 */
export interface ScheduleFailureMessages {
  conflict: string
  forbidden: string
  notFound: string
  unavailable: string
  unexpected: string
}

export function toScheduleFailure<F extends string>(
  action: string,
  cause: unknown,
  messages: ScheduleFailureMessages,
): ActionResult<never, F> {
  if (isAppointmentRepositoryError(cause)) {
    console.error(`[${action}] escrita recusada`, {
      reason: cause.reason,
      code: cause.code,
    })

    switch (cause.reason) {
      case 'conflict':
        return err<F>('conflict', messages.conflict)
      case 'not-found':
        return err<F>('not-found', messages.notFound)
      case 'forbidden':
        return err<F>('forbidden', messages.forbidden)
      case 'unavailable':
        return err<F>('unavailable', messages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', messages.unexpected)
    }
  }

  console.error(`[${action}] falha nao tratada`, {
    kind: cause instanceof Error ? cause.name : typeof cause,
  })

  return err<F>('unexpected', messages.unexpected)
}
