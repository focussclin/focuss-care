import { AlertCircle, CreditCard } from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import type { QuotaLevel } from '../domain/Subscription'

export interface QuotaDto {
  label: string
  used: number
  /** Null é **sem teto**, e a tela escreve "ilimitado" em vez de "0". */
  limit: number | null
  level: QuotaLevel
}

export interface AssinaturaScreenProps {
  plan: {
    name: string
    price: string
    statusLabel: string
    statusTone: 'positive' | 'attention' | 'negative' | 'neutral'
    /** Frase já montada: "Teste até 20/08/2026" ou "Período até 01/09/2026". */
    periodLabel: string | null
  } | null
  quotas: readonly QuotaDto[]
  isLive: boolean
}

const TONE_CLASS: Record<
  NonNullable<AssinaturaScreenProps['plan']>['statusTone'],
  string
> = {
  positive:
    'border-status-positive/30 bg-status-positive-surface text-status-positive',
  attention: 'border-attention/30 bg-attention-surface text-foreground',
  negative: 'border-danger/30 bg-danger-surface text-danger',
  neutral: 'border-border-card bg-surface text-muted',
}

const QUOTA_CLASS: Record<QuotaLevel, string> = {
  ok: 'bg-brand-accent',
  near: 'bg-attention',
  reached: 'bg-danger',
}

/**
 * A assinatura da clínica no Focuss Care.
 *
 * # O que esta tela deliberadamente não tem: botão de mudar plano
 *
 * `subscriptions.provider` e `provider_subscription_id` apontam para um gateway
 * de pagamento que **não existe no produto**. Um botão "fazer upgrade" que só
 * trocasse a linha no banco daria à clínica uma cota maior que ninguém está
 * cobrando — e, no dia em que a cobrança entrasse, uma fatura que ela não
 * reconheceria. A tela diz por onde a mudança acontece hoje.
 *
 * # As cotas são contadas, não guardadas
 *
 * Um contador materializado desanda em toda escrita que esquecer de atualizá-lo,
 * e o número errado aqui vira "você atingiu o limite" para quem não atingiu.
 */
export function AssinaturaScreen({
  plan,
  quotas,
  isLive,
}: AssinaturaScreenProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Conta da clínica"
        title="Assinatura"
        description="O plano contratado e quanto das cotas já foi usado."
      />

      {!isLive ? (
        <p
          role="status"
          className="rounded-card border border-attention/30 bg-attention-surface px-4 py-3 text-aux text-foreground"
        >
          Demonstração local: sem banco não há assinatura a mostrar.
        </p>
      ) : null}

      {plan ? (
        <Card className="flex flex-col gap-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-h2 font-semibold text-foreground">
                {plan.name}
              </h2>
              <p className="text-control text-muted">{plan.price}</p>
            </div>

            <span
              className={`rounded-field border px-3 py-1 text-label font-semibold ${TONE_CLASS[plan.statusTone]}`}
            >
              {plan.statusLabel}
            </span>
          </div>

          {plan.periodLabel ? (
            <p className="text-aux text-muted">{plan.periodLabel}</p>
          ) : null}
        </Card>
      ) : (
        <Card className="p-6">
          <EmptyState
            icon={CreditCard}
            title="Nenhuma assinatura registrada"
            description="Esta clínica não tem plano contratado no sistema. As cotas abaixo continuam contadas do uso real."
          />
        </Card>
      )}

      <Card className="flex flex-col gap-5 p-6">
        <h2 className="text-h3 font-semibold text-foreground">Uso das cotas</h2>

        <ul className="flex flex-col gap-5">
          {quotas.map((quota) => (
            <li key={quota.label} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-control text-foreground">
                  {quota.label}
                </span>
                <span className="text-aux text-muted">
                  {quota.limit === null
                    ? `${quota.used} · ilimitado`
                    : `${quota.used} de ${quota.limit}`}
                </span>
              </div>

              {quota.limit === null ? null : (
                <div
                  role="meter"
                  aria-label={quota.label}
                  aria-valuenow={quota.used}
                  aria-valuemin={0}
                  aria-valuemax={quota.limit}
                  className="h-2 w-full overflow-hidden rounded-full bg-row-hover"
                >
                  <div
                    className={`h-full rounded-full ${QUOTA_CLASS[quota.level]}`}
                    style={{
                      width: `${Math.min(100, Math.round((quota.used / Math.max(quota.limit, 1)) * 100))}%`,
                    }}
                  />
                </div>
              )}

              {quota.level === 'reached' ? (
                <p className="flex items-center gap-1.5 text-label text-danger">
                  <AlertCircle aria-hidden className="size-3.5" />
                  Limite do plano atingido.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {/*
        A ausência declarada, e não um botão que não cobraria nada.
      */}
      <Card className="flex flex-col gap-2 p-6">
        <h2 className="text-h3 font-semibold text-foreground">
          Mudar de plano
        </h2>
        <p className="text-aux text-muted">
          A troca de plano ainda não acontece por aqui: o produto não tem
          integração com meio de pagamento. Fale com o suporte do Focuss Care
          para alterar a contratação — a mudança aparece nesta tela assim que for
          registrada.
        </p>
      </Card>
    </div>
  )
}
