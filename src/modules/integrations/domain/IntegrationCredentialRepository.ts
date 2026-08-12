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

  /**
   * Os valores DECIFRADOS de um provedor. `null` quando nada foi configurado.
   *
   * # Quem pode chamar isto
   *
   * Só adapter server-side que precise falar com o provedor — hoje, o gateway
   * de WhatsApp. **Nunca uma action que devolva o resultado à tela, e nunca um
   * componente.** O painel de integrações vive inteiro de `overview()`, que
   * responde "configurado quando" sem tocar no segredo.
   *
   * Está na porta, e não escondido no adapter, porque é a operação mais
   * perigosa deste módulo: quem trocar o backend precisa ver que existe um
   * caminho de leitura em claro, e mantê-lo igualmente restrito.
   */
  load(
    clinicId: string,
    provider: IntegrationCredentialProvider,
  ): Promise<IntegrationCredentialValues | null>
}
