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
  /** Sala ocupada — resolve-se trocando de sala, não de horário. */
  roomConflict: string
  /**
   * Chamada à ação, acrescentada ao motivo que o adapter montou.
   *
   * Duas partes porque a primeira é dinâmica ("Sábado: a clínica atende das
   * 08:00 às 12:00") e a segunda é fixa. Só a fixa mora em `scheduleMessages`.
   */
  outsideBusinessHours: string
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
      case 'room-conflict':
        return err<F>('conflict', messages.roomConflict)
      /*
       * 'needs-confirmation', e não 'conflict': a operação é possível, e quem
       * recebe este código precisa OFERECER a confirmação. Devolver 'conflict'
       * aqui transformaria uma pergunta em recusa com texto amigável, e a
       * recepção acabaria registrando hora falsa para conseguir marcar.
       *
       * `userDetail` é montado por este código a partir da configuração da
       * clínica — nunca é mensagem do Postgres. Ver o JSDoc do campo.
       */
      case 'outside-business-hours':
        return err<F>(
          'needs-confirmation',
          [cause.userDetail, messages.outsideBusinessHours]
            .filter(Boolean)
            .join(' '),
        )
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
