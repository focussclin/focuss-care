import type { SubscriptionStatus } from '@/lib/supabase/database.types'
import { formatCents } from '@/lib/utils/money'
import { formatShortDate } from '@/lib/utils/date'

import {
  quotaLevelOf,
  type SubscriptionOverview,
} from '../domain/Subscription'

/**
 * Entidade -> o que a tela desenha.
 *
 * Existe para que a decisão de COMO dizer o estado da assinatura fique fora do
 * componente: "vencida" e "cancelada" levam a ações diferentes, e a frase é
 * regra de negócio, não estilo.
 */

type StatusTone = 'positive' | 'attention' | 'negative' | 'neutral'

const STATUS: Record<
  SubscriptionStatus,
  { label: string; tone: StatusTone }
> = {
  trialing: { label: 'Em teste', tone: 'attention' },
  active: { label: 'Ativa', tone: 'positive' },
  /*
   * "Pagamento pendente", e não "vencida": a assinatura continua valendo, e é
   * exatamente por isso que o aviso precisa aparecer antes de virar corte.
   */
  past_due: { label: 'Pagamento pendente', tone: 'negative' },
  canceled: { label: 'Cancelada', tone: 'neutral' },
  incomplete: { label: 'Contratação incompleta', tone: 'attention' },
}

export interface SubscriptionView {
  plan: {
    name: string
    price: string
    statusLabel: string
    statusTone: StatusTone
    periodLabel: string | null
  } | null
  quotas: readonly {
    label: string
    used: number
    limit: number | null
    level: ReturnType<typeof quotaLevelOf>
  }[]
}

/**
 * A frase do período depende do estado, e não do campo preenchido.
 *
 * Em teste, o que importa é quando o teste acaba. Cancelada, quando foi
 * cancelada. Ativa, até quando o período vigente vai. Mostrar sempre o mesmo
 * campo faria uma assinatura cancelada anunciar uma renovação futura.
 */
function describePeriod(
  status: SubscriptionStatus,
  trialEndsAt: Date | null,
  currentPeriodEnd: Date | null,
  canceledAt: Date | null,
): string | null {
  if (status === 'trialing' && trialEndsAt) {
    return `Teste até ${formatShortDate(trialEndsAt)}`
  }

  if (status === 'canceled' && canceledAt) {
    return `Cancelada em ${formatShortDate(canceledAt)}`
  }

  return currentPeriodEnd
    ? `Período vigente até ${formatShortDate(currentPeriodEnd)}`
    : null
}

export function toSubscriptionView(
  overview: SubscriptionOverview,
): SubscriptionView {
  const { subscription, usage } = overview

  const quotas = [
    {
      label: 'Profissionais ativos',
      used: usage.professionals,
      limit: subscription?.plan.maxProfessionals ?? null,
      level: quotaLevelOf(
        usage.professionals,
        subscription?.plan.maxProfessionals ?? null,
      ),
    },
    {
      label: 'Pacientes cadastrados',
      used: usage.patients,
      limit: subscription?.plan.maxPatients ?? null,
      level: quotaLevelOf(
        usage.patients,
        subscription?.plan.maxPatients ?? null,
      ),
    },
  ]

  if (!subscription) return { plan: null, quotas }

  const status = STATUS[subscription.status]

  return {
    plan: {
      name: subscription.plan.name,
      price: `${formatCents(subscription.plan.priceCents)} por mês`,
      statusLabel: status.label,
      statusTone: status.tone,
      periodLabel: describePeriod(
        subscription.status,
        subscription.trialEndsAt,
        subscription.currentPeriodEnd,
        subscription.canceledAt,
      ),
    },
    quotas,
  }
}
