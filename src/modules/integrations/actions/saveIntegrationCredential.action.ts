'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toIntegrationCredentialFailure } from '../application/integrationCredentialFailure'
import {
  integrationCredentialRepositoryFor,
} from '../infrastructure/credentials-repository'
import {
  integrationCredentialMessages,
  normalizeIntegrationCredentialValues,
  saveIntegrationCredentialSchema,
  type SaveIntegrationCredentialInput,
} from '../schemas/integrationCredential.schema'
import type { IntegrationCredentialStatus } from '../domain/IntegrationCredential'

type Field = 'provider' | 'values'

const runSaveIntegrationCredential = createAction<
  SaveIntegrationCredentialInput,
  IntegrationCredentialStatus,
  Field
>({
  name: 'integrationCredential.save',
  schema: saveIntegrationCredentialSchema,
  roles: rolesWith('clinic.settings'),
  messages: {
    forbidden: integrationCredentialMessages.forbidden,
    validation: integrationCredentialMessages.invalidFields,
    unavailable: integrationCredentialMessages.unavailable,
    unexpected: integrationCredentialMessages.unexpected,
  },
  revalidatePaths: ['/configuracoes'],
  handler: async (input, context) => {
    try {
      const values = normalizeIntegrationCredentialValues(
        input.provider,
        input.values,
      )
      const status = await integrationCredentialRepositoryFor(
        context.supabase,
      ).save(context.clinicId, context.userId, input.provider, values)

      return ok(status)
    } catch (cause) {
      return toIntegrationCredentialFailure<Field>(
        'integrationCredential.save',
        cause,
      )
    }
  },
  // Segredo nenhum entra na auditoria. O evento registra apenas o provedor.
  audit: (output) => ({
    action: 'integration.credential_saved',
    entityType: 'clinic_integration_credentials',
    entityId: null,
    after: { provider: output.provider, configured: true },
  }),
})

export async function saveIntegrationCredentialAction(
  rawInput: unknown,
): Promise<ActionResult<IntegrationCredentialStatus, Field>> {
  return runSaveIntegrationCredential(rawInput)
}
