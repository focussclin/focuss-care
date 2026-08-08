import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isClinicSettingsError } from '../domain/ClinicSettingsError'
import { settingsMessages } from '../schemas/settings.schema'

/**
 * Falha de escrita das configurações -> `Result` com mensagem em pt-BR.
 *
 * **O log recebe apenas `reason` e `code`.** O texto do Postgres pode ecoar o
 * valor submetido — aqui, razão social e CNPJ da empresa — e log é lido por
 * muito mais gente que a tabela.
 */
export function toSettingsFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isClinicSettingsError(cause)) {
    console.error(`[${action}] escrita recusada`, {
      reason: cause.reason,
      code: cause.code,
    })

    switch (cause.reason) {
      case 'duplicate':
        /*
         * O único campo deste formulário com cara de chave única é o CNPJ, então
         * a mensagem aponta para ele e marca o campo. Se o banco tiver outra
         * constraint que ninguém previu, o texto erra o alvo — e é por isso que
         * ele diz o que fazer ("confira") em vez de afirmar culpa do usuário.
         */
        return err<F>('conflict', settingsMessages.cnpjTaken, {
          cnpj: settingsMessages.cnpjTaken,
        } as Partial<Record<F, string>>)
      case 'not-found':
        return err<F>('not-found', settingsMessages.notFound)
      case 'forbidden':
        return err<F>('forbidden', settingsMessages.forbidden)
      case 'unavailable':
        return err<F>('unavailable', settingsMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', settingsMessages.unexpected)
    }
  }

  console.error(`[${action}] falha nao tratada`, {
    kind: cause instanceof Error ? cause.name : typeof cause,
  })

  return err<F>('unexpected', settingsMessages.unexpected)
}
