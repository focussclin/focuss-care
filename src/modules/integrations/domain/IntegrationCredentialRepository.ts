import type {
  IntegrationCredentialOverview,
  IntegrationCredentialProvider,
  IntegrationCredentialStatus,
  IntegrationCredentialValues,
} from './IntegrationCredential'

export interface IntegrationCredentialRepository {
  overview(clinicId: string): Promise<IntegrationCredentialOverview>
  save(
    clinicId: string,
    userId: string,
    provider: IntegrationCredentialProvider,
    values: IntegrationCredentialValues,
  ): Promise<IntegrationCredentialStatus>
}
