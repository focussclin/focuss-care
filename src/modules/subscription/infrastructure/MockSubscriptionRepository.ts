import type { SubscriptionOverview } from '../domain/Subscription'
import type { SubscriptionRepository } from '../domain/SubscriptionRepository'

/**
 * Demonstração local.
 *
 * **Não inventa um plano contratado.** Uma assinatura de exemplo diria à pessoa
 * que a clínica dela tem um plano ativo e uma cota — dois números que ela
 * repetiria para o contador. Devolver ausência é a única resposta honesta sem
 * banco, e a tela já sabe dizer isso.
 *
 * O uso continua contado a partir dos mesmos dados de exemplo que a agenda e a
 * lista de pacientes usam, para que os números não se contradigam entre telas.
 */
export class MockSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly usage: { professionals: number; patients: number }) {}

  // Parametro omitido, como nos outros mocks: a demonstracao nao tem tenant.
  async overview(): Promise<SubscriptionOverview> {
    return { subscription: null, usage: this.usage }
  }
}
