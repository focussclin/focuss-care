import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, SubscriptionStatus } from '@/lib/supabase/database.types'

import type {
  Subscription,
  SubscriptionOverview,
  SubscriptionUsage,
} from '../domain/Subscription'
import type { SubscriptionRepository } from '../domain/SubscriptionRepository'

/**
 * O plano vem embutido na assinatura.
 *
 * `plans` **não tem `clinic_id`** — é catálogo global, igual para todo mundo. O
 * recorte de tenant acontece em `subscriptions`, e é por isso que a leitura
 * parte dela: partir de `plans` traria a tabela inteira e obrigaria a filtrar
 * depois, no cliente.
 */
const SUBSCRIPTION_SELECT = `
  id,
  status,
  trial_ends_at,
  current_period_start,
  current_period_end,
  canceled_at,
  provider,
  plans (
    id,
    name,
    price_cents,
    currency,
    max_professionals,
    max_patients,
    storage_mb
  )
`

interface PlanRow {
  id: string
  name: string
  price_cents: number
  currency: string
  max_professionals: number | null
  max_patients: number | null
  storage_mb: number | null
}

interface SubscriptionRow {
  id: string
  status: SubscriptionStatus
  trial_ends_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  canceled_at: string | null
  provider: string | null
  plans: PlanRow | null
}

function toDate(value: string | null): Date | null {
  return value ? new Date(value) : null
}

function toSubscription(row: SubscriptionRow): Subscription | null {
  // Assinatura sem plano é linha órfã: sem cota, sem preço e sem nada a exibir.
  // Tratar como ausência é melhor que desenhar um plano vazio.
  if (!row.plans) return null

  return {
    id: row.id,
    status: row.status,
    plan: {
      id: row.plans.id,
      name: row.plans.name,
      priceCents: row.plans.price_cents,
      currency: row.plans.currency,
      maxProfessionals: row.plans.max_professionals,
      maxPatients: row.plans.max_patients,
      storageMb: row.plans.storage_mb,
    },
    trialEndsAt: toDate(row.trial_ends_at),
    currentPeriodStart: toDate(row.current_period_start),
    currentPeriodEnd: toDate(row.current_period_end),
    canceledAt: toDate(row.canceled_at),
    provider: row.provider,
  }
}

/**
 * Leitura da assinatura, com o uso contado na hora.
 *
 * Toda consulta filtra `clinic_id` explicitamente. A RLS impede o vazamento; o
 * filtro impede a consulta errada — defesa em profundidade, como no resto dos
 * adapters.
 */
export class SupabaseSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async overview(clinicId: string): Promise<SubscriptionOverview> {
    const [subscription, usage] = await Promise.all([
      this.readSubscription(clinicId),
      this.countUsage(clinicId),
    ])

    return { subscription, usage }
  }

  private async readSubscription(
    clinicId: string,
  ): Promise<Subscription | null> {
    const { data, error } = await this.client
      .from('subscriptions')
      .select(SUBSCRIPTION_SELECT)
      .eq('clinic_id', clinicId)
      /*
       * Mais de uma linha por clínica é possível no schema (histórico de
       * assinatura). A vigente é a mais recente — e `maybeSingle` sem `limit`
       * quebraria justamente na clínica que já trocou de plano.
       */
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw readFailure('readSubscription', error)
    if (!data) return null

    return toSubscription(data as unknown as SubscriptionRow)
  }

  /**
   * Cota usada, contada com `head` — sem transferir linha.
   *
   * Conta o que a cota cobra: profissional ATIVO e paciente não removido. Somar
   * inativos diria que a clínica estourou o plano por causa de gente que não
   * usa o sistema.
   */
  private async countUsage(clinicId: string): Promise<SubscriptionUsage> {
    const [professionals, patients] = await Promise.all([
      this.countProfessionals(clinicId),
      this.countPatients(clinicId),
    ])

    return { professionals, patients }
  }

  private async countProfessionals(clinicId: string): Promise<number> {
    const { count, error } = await this.client
      .from('professionals')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .eq('is_active', true)

    if (error) throw readFailure('countProfessionals', error)

    return count ?? 0
  }

  private async countPatients(clinicId: string): Promise<number> {
    const { count, error } = await this.client
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)

    if (error) throw readFailure('countPatients', error)

    return count ?? 0
  }
}

function readFailure(
  context: string,
  error: { code?: string | null; message?: string | null },
): Error {
  // Só `code` no log: a mensagem do Postgres pode ecoar valores da consulta.
  console.error(`[subscription] ${context}`, { code: error.code ?? null })

  return new Error('Não foi possível carregar a assinatura.')
}
