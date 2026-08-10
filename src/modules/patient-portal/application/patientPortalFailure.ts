import { describeCause } from '@/lib/observability/describe-cause'
import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isPatientPortalRepositoryError } from '../domain/PatientPortalRepositoryError'
import { patientPortalMessages } from '../schemas/patientPortal.schema'

/**
 * Traduz a falha do repositório para o `Result` da action.
 *
 * As mensagens são as do módulo, e cada uma existe porque **a ação que resolve é
 * diferente**: "peça um novo" para expirado, "entre pelo login" para já usado,
 * "fale com a recepção" para revogado. Colapsar tudo em "convite inválido"
 * transformaria cinco saídas num beco — numa tela que a pessoa abre uma vez na
 * vida, sozinha, sem ninguém do lado para explicar.
 */
export function toPatientPortalFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isPatientPortalRepositoryError(cause)) {
    // Log estruturado, com lista fechada de campos. Nunca o token.
    console.error(`[${action}] portal do paciente recusou`, {
      reason: cause.reason,
      code: cause.code,
    })

    switch (cause.reason) {
      case 'forbidden':
        return err<F>('forbidden', patientPortalMessages.forbidden)
      case 'not-found':
        return err<F>('not-found', patientPortalMessages.notFound)
      case 'already-linked':
        return err<F>('conflict', patientPortalMessages.alreadyLinked)
      case 'invalid-email':
        return err<F>('validation', patientPortalMessages.invalidEmail)
      case 'invite-expired':
        return err<F>('validation', patientPortalMessages.inviteExpired)
      case 'invite-used':
        return err<F>('conflict', patientPortalMessages.inviteUsed)
      case 'invite-revoked':
        return err<F>('validation', patientPortalMessages.inviteRevoked)
      case 'email-mismatch':
        return err<F>('forbidden', patientPortalMessages.emailMismatch)
      case 'not-authenticated':
        return err<F>('unauthenticated', patientPortalMessages.notAuthenticated)
      case 'schema-not-ready':
        return err<F>('unavailable', patientPortalMessages.schemaPending)
      case 'unavailable':
        return err<F>('unavailable', patientPortalMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', patientPortalMessages.unexpected)
    }
  }

  console.error(`[${action}] falha inesperada`, describeCause(cause))

  return err<F>('unexpected', patientPortalMessages.unexpected)
}
