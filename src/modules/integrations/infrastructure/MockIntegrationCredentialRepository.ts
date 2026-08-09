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
}
