import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isMedicalRecordRepositoryError } from '../domain/MedicalRecordRepositoryError'
import { recordMessages } from '../schemas/record.schema'

/**
 * Falha de escrita do prontuário -> `Result` com mensagem em pt-BR.
 *
 * **O log recebe APENAS `reason` e `code` — nunca a mensagem.**
 *
 * Esta é a regra mais dura de todo o produto, e a tabela é o motivo: em
 * `medical_records`, o texto de erro do Postgres pode ecoar o valor enviado, e
 * o valor enviado é conteúdo clínico. Uma linha de log com a evolução de uma
 * paciente é um vazamento — o log é lido por muito mais gente do que a tabela,
 * fica retido mais tempo, e frequentemente sai da infraestrutura para
 * ferramentas de observabilidade de terceiros.
 *
 * Nos outros módulos o `describeCause` traz `details` e `hint`. Aqui, não.
 */
export function toRecordFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isMedicalRecordRepositoryError(cause)) {
    console.error(`[${action}] escrita recusada`, {
      reason: cause.reason,
      code: cause.code,
    })

    switch (cause.reason) {
      case 'not-a-professional':
        return err<F>('forbidden', recordMessages.notAProfessional)
      case 'superseded':
        return err<F>('conflict', recordMessages.superseded)
      case 'not-found':
        return err<F>('not-found', recordMessages.notFound)
      case 'forbidden':
        return err<F>('forbidden', recordMessages.forbidden)
      case 'unavailable':
        return err<F>('unavailable', recordMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', recordMessages.unexpected)
    }
  }

  console.error(`[${action}] falha nao tratada`, {
    kind: cause instanceof Error ? cause.name : typeof cause,
  })

  return err<F>('unexpected', recordMessages.unexpected)
}
