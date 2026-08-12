import type {
  IntegrationCredentialOverview,
  IntegrationCredentialStatus,
} from '../domain/IntegrationCredential'
import type { IntegrationCredentialRepository } from '../domain/IntegrationCredentialRepository'
import { emptyIntegrationCredentialStatuses } from '../domain/IntegrationCredential'

/** No modo demo, a tela mostra o cofre vazio e desabilita qualquer escrita. */
export class MockIntegrationCredentialRepository
  implements IntegrationCredentialRepository
{
  async overview(): Promise<IntegrationCredentialOverview> {
    return {
      statuses: emptyIntegrationCredentialStatuses(),
      storeState: 'demo',
    }
  }

  async save(): Promise<IntegrationCredentialStatus> {
    throw new Error('The integration credential vault is unavailable in demo mode.')
  }

  /**
   * Cofre vazio na demonstração — e `null`, não uma credencial de mentira.
   *
   * Devolver valores de exemplo faria o gateway de WhatsApp tentar falar com um
   * endereço inventado, e o erro apareceria como falha do provedor em vez de
   * "não há banco configurado aqui".
   */
  async load(): Promise<null> {
    return null
  }
}
