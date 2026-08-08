import type { SubscriptionOverview } from './Subscription'

/**
 * PORTA da assinatura da clínica.
 *
 * # Só leitura, e a ausência de escrita é a informação
 *
 * Não há `changePlan`, `cancel` nem `resume`. Não é escopo cortado: **não há
 * para onde escrever**. `subscriptions.provider` e `provider_subscription_id`
 * apontam para um gateway de pagamento que não existe no produto, e um botão
 * "mudar plano" que só trocasse a linha no banco daria à clínica um plano que
 * ninguém está cobrando — e uma cota que ela acha que comprou.
 *
 * Quando houver gateway, a escrita nasce com ele, e a fonte da verdade passa a
 * ser o webhook do provedor, não esta tela.
 */
export interface SubscriptionRepository {
  /**
   * Assinatura vigente e uso atual das cotas.
   *
   * Nunca falha por ausência: clínica sem linha em `subscriptions` devolve
   * `subscription: null` com o uso contado do mesmo jeito. Saber quantos
   * profissionais e pacientes existem continua útil sem plano contratado.
   */
  overview(clinicId: string): Promise<SubscriptionOverview>
}
