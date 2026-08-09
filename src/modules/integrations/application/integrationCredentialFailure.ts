import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import {
  isIntegrationCredentialRepositoryError,
} from '../domain/IntegrationCredentialRepositoryError'
import { integrationCredentialMessages } from '../schemas/integrationCredential.schema'

export function toIntegrationCredentialFailure<F extends string>(
  action: string,
  cause: unknown,
): ActionResult<never, F> {
  if (isIntegrationCredentialRepositoryError(cause)) {
    console.error(`[${action}] credential vault operation rejected`, {
      reason: cause.reason,
      code: cause.code ?? null,
    })

    switch (cause.reason) {
      case 'schema-not-ready':
        return err<F>('unavailable', integrationCredentialMessages.schemaPending)
      case 'vault-not-configured':
        return err<F>('unavailable', integrationCredentialMessages.vaultNotConfigured)
      case 'unavailable':
        return err<F>('unavailable', integrationCredentialMessages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', integrationCredentialMessages.unexpected)
    }
  }

  console.error(`[${action}] unhandled credential vault failure`, {
    kind: cause instanceof Error ? cause.name : typeof cause,
  })

  return err<F>('unexpected', integrationCredentialMessages.unexpected)
}
