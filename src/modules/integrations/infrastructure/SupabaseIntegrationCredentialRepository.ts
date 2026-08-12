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
import {
  decryptIntegrationCredentials,
  encryptIntegrationCredentials,
  IntegrationVaultError,
  INTEGRATION_KEY_VERSION,
} from './integration-vault'

type Client = SupabaseClient<Database>

function isMissingSchema(error: { code?: string | null; message?: string | null }) {
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.message?.toLowerCase().includes('clinic_integration_credentials')
  )
}

/**
 * O provedor vem do banco como TEXTO, e a aplicação não confia nele.
 *
 * `clinic_integration_credentials.provider` é `text` com `check (provider in
 * (...))` — não é enum. O tipo gerado é `string`, e é honesto que seja: o
 * `check` do banco e a lista de `INTEGRATION_CREDENTIAL_DEFINITIONS` são duas
 * listas que podem divergir (uma migration acrescenta um provedor antes de a
 * aplicação conhecê-lo).
 *
 * Estreitar com `as` calaria o compilador e deixaria um provedor desconhecido
 * atravessar até a tela, onde viraria um cartão sem rótulo. Descartar a linha é
 * o comportamento que a tela já sabe tratar: o provedor aparece como não
 * configurado, que é o que ele é para esta versão da aplicação.
 */
function knownProvider(value: string): IntegrationCredentialProvider | null {
  const match = emptyIntegrationCredentialStatuses().find(
    (status) => status.provider === value,
  )

  return match ? match.provider : null
}

function toStatus(row: {
  provider: string
  updated_at: string
}): IntegrationCredentialStatus | null {
  const provider = knownProvider(row.provider)

  return provider ? statusForProvider(provider, row.updated_at) : null
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
      (data ?? [])
        .map((row) => toStatus(row))
        .filter((status): status is IntegrationCredentialStatus => status !== null)
        .map((status) => [status.provider, status]),
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

    /*
     * O provedor da resposta é o MESMO que a aplicação acabou de enviar, e ele
     * já é do tipo estreito. Reler do `row` só reintroduziria a incerteza que
     * `knownProvider` existe para tratar — aqui não há nenhuma.
     */
    return statusForProvider(provider, data.updated_at)
  }

  /**
   * Leitura EM CLARO — o único caminho do módulo que decifra o cofre.
   *
   * `encrypted_payload` só entra no `select` aqui. Nas outras consultas a coluna
   * fica de fora de propósito: o que não é lido não vaza por log, por erro de
   * serialização nem por um `console.log` esquecido.
   */
  async load(
    clinicId: string,
    provider: IntegrationCredentialProvider,
  ): Promise<IntegrationCredentialValues | null> {
    const { data, error } = await this.client
      .from('clinic_integration_credentials')
      .select('encrypted_payload')
      .eq('clinic_id', clinicId)
      .eq('provider', provider)
      .maybeSingle()

    if (error) {
      throw new IntegrationCredentialRepositoryError(
        isMissingSchema(error) ? 'schema-not-ready' : 'unavailable',
        'The integration credential store is not available.',
        error.code ?? undefined,
      )
    }

    if (!data) return null

    try {
      return await decryptIntegrationCredentials(data.encrypted_payload)
    } catch (cause) {
      /*
       * Falha ao decifrar quase sempre significa `INTEGRATION_ENCRYPTION_KEY`
       * trocada entre ambientes: o dado cifrado com a chave anterior continua
       * no banco e não abre mais. Dizer 'vault-not-configured' aponta para onde
       * está o problema — a chave —, em vez de sugerir que a integração sumiu.
       */
      if (cause instanceof IntegrationVaultError) {
        throw new IntegrationCredentialRepositoryError(
          'vault-not-configured',
          'The integration vault cannot read the stored credential.',
        )
      }

      throw cause
    }
  }
}
