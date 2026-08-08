import type { SubscriptionStatus } from '@/lib/supabase/database.types'

/**
 * A assinatura da CLÍNICA no Focuss Care — não a cobrança de um paciente.
 *
 * Duas coisas com o nome parecido e domínios opostos: `billing` cuida do que a
 * clínica cobra de quem atende; isto é o que a clínica paga para usar o produto.
 * Misturá-las faria uma fatura de paciente e uma mensalidade de SaaS caírem na
 * mesma tela.
 */
export interface SubscriptionPlan {
  id: string
  name: string
  priceCents: number
  currency: string
  /** Null significa **sem teto**, e não zero — a diferença muda a tela. */
  maxProfessionals: number | null
  maxPatients: number | null
  storageMb: number | null
}

/**
 * Quanto da cota já foi usado.
 *
 * Contado do banco na hora, e não guardado numa coluna: um contador
 * materializado desanda em toda escrita que esquecer de atualizá-lo, e o número
 * errado aqui vira "você atingiu o limite" para quem não atingiu.
 */
export interface SubscriptionUsage {
  professionals: number
  patients: number
}

export interface Subscription {
  id: string
  status: SubscriptionStatus
  plan: SubscriptionPlan
  /** Fim do teste gratuito, quando `status` é `trialing`. */
  trialEndsAt: Date | null
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  canceledAt: Date | null
  /**
   * Gateway que emitiu a assinatura, quando houver.
   *
   * Hoje é sempre null: **não há gateway de pagamento no produto**. A coluna
   * existe no schema e a tela declara a ausência em vez de fingir um botão de
   * "mudar plano" que não cobraria nada.
   */
  provider: string | null
}

/**
 * O que a tela mostra quando não há linha em `subscriptions`.
 *
 * Não é erro: uma clínica criada antes de existir cobrança simplesmente não tem
 * assinatura. Devolver `null` e deixar a tela dizer isso é mais honesto que
 * inventar um plano "gratuito" que ninguém contratou.
 */
export interface SubscriptionOverview {
  subscription: Subscription | null
  usage: SubscriptionUsage
}

/** Um limite foi atingido ou está perto disso? */
export type QuotaLevel = 'ok' | 'near' | 'reached'

/** A partir de quanto do teto a tela começa a avisar. */
const NEAR_THRESHOLD = 0.8

export function quotaLevelOf(used: number, limit: number | null): QuotaLevel {
  // Sem teto não há o que avisar. `null` é ilimitado; zero seria "nenhum".
  if (limit === null) return 'ok'
  if (limit <= 0) return 'reached'
  if (used >= limit) return 'reached'

  return used / limit >= NEAR_THRESHOLD ? 'near' : 'ok'
}
