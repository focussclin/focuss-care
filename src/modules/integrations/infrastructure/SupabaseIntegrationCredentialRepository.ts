import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import {
  emptyIntegrationCredentialStatuses,
  statusForProvider,
  type IntegrationCredentialOverview,
  type IntegrationCredentialProvider,
  type IntegrationCredentialStatus,
  type IntegrationCredentialValues,
} from '../domain/IntegrationCredential'
import type { IntegrationCredentialRepository } from '../domain/IntegrationCredentialRepository'
import { IntegrationCredentialRepositoryError } from '../domain/IntegrationCredentialRepositoryError'
import { encryptIntegrationCredentials, IntegrationVaultError, INTEGRATION_KEY_VERSION } from './integration-vault'

type Client = SupabaseClient<Database>

function isMissingSchema(error: { code?: string | null; message?: string | null }) {
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.message?.toLowerCase().includes('clinic_integration_credentials')
  )
}

function toStatus(row: {
  provider: IntegrationCredentialProvider
  updated_at: string
}): IntegrationCredentialStatus {
  return statusForProvider(row.provider, row.updated_at)
}

/**
 * Adapter do cofre por clínica.
 *
 * A leitura de status seleciona somente provider/updated_at. O payload cifrado
 * nunca é devolvido à página e só será lido por um adapter server-side que
 * precise executar uma integração.
 */
export class SupabaseIntegrationCredentialRepository
  implements IntegrationCredentialRepository
{
  constructor(private readonly client: Client) {}

  async overview(clinicId: string): Promise<IntegrationCredentialOverview> {
    const { data, error } = await this.client
      .from('clinic_integration_credentials')
      .select('provider, updated_at')
      .eq('clinic_id', clinicId)

    if (error) {
      if (isMissingSchema(error)) {
        return {
          statuses: emptyIntegrationCredentialStatuses(),
          storeState: 'schema-not-ready',
        }
      }

      console.error('[integrations] load credential statuses', {
        code: error.code ?? null,
      })
      return {
        statuses: emptyIntegrationCredentialStatuses(),
        storeState: 'unavailable',
      }
    }

    const configured = new Map(
      (data ?? []).map((row) => [row.provider, toStatus(row)]),
    )

    return {
      statuses: emptyIntegrationCredentialStatuses().map(
        (status) => configured.get(status.provider) ?? status,
      ),
      storeState: 'ready',
    }
  }

  async save(
    clinicId: string,
    userId: string,
    provider: IntegrationCredentialProvider,
    values: IntegrationCredentialValues,
  ): Promise<IntegrationCredentialStatus> {
    let encryptedPayload: string
    try {
      encryptedPayload = await encryptIntegrationCredentials(values)
    } catch (cause) {
      if (cause instanceof IntegrationVaultError) {
        throw new IntegrationCredentialRepositoryError(
          'vault-not-configured',
          'The integration vault is not configured.',
        )
      }
      throw cause
    }

    const { data, error } = await this.client
      .from('clinic_integration_credentials')
      .upsert(
        {
          clinic_id: clinicId,
          provider,
          encrypted_payload: encryptedPayload,
          key_version: INTEGRATION_KEY_VERSION,
          configured_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'clinic_id,provider' },
      )
      .select('provider, updated_at')
      .maybeSingle()

    if (error) {
      throw new IntegrationCredentialRepositoryError(
        isMissingSchema(error) ? 'schema-not-ready' : 'unavailable',
        'The integration credential store is not available.',
        error.code ?? undefined,
      )
    }

    if (!data) {
      throw new IntegrationCredentialRepositoryError(
        'unexpected',
        'The integration credential was not saved.',
      )
    }

    return toStatus(data)
  }
}
