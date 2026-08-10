import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Lightbulb,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'

import type { OperationalInsight, InsightSeverity } from '../application/operationalInsights'

export interface InsightsScreenProps {
  insights: readonly OperationalInsight[]
  isLive: boolean
  periodLabel: string
}

const severityMeta: Record<
  InsightSeverity,
  { label: string; tone: StatusTone; icon: LucideIcon; iconClass: string }
> = {
  critical: {
    label: 'Ação imediata',
    tone: 'negative',
    icon: TriangleAlert,
    iconClass: 'bg-status-negative-surface text-status-negative',
  },
  attention: {
    label: 'Atenção',
    tone: 'pending',
    icon: AlertTriangle,
    iconClass: 'bg-status-pending-surface text-status-pending',
  },
  positive: {
    label: 'Tudo certo',
    tone: 'positive',
    icon: CheckCircle2,
    iconClass: 'bg-status-positive-surface text-status-positive',
  },
}

export function InsightsScreen({ insights, isLive, periodLabel }: InsightsScreenProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Inteligência operacional"
        title="Insights proativos"
        description="Sinais explicáveis para orientar a próxima ação da clínica."
      />

      <div className="flex items-start gap-2.5 rounded-card border border-brand/20 bg-brand-subtle px-4 py-3 text-aux text-link">
        <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>
          Os alertas abaixo usam apenas dados registrados no Focuss Care. Nenhuma
          estimativa de mercado ou recomendação clínica é inventada.
        </p>
      </div>

      {!isLive ? (
        <p
          role="status"
          className="rounded-card border border-attention/30 bg-attention-surface px-4 py-3 text-aux text-foreground"
        >
          Demonstração local: os sinais são derivados dos dados de exemplo e não
          representam a operação de uma clínica real.
        </p>
      ) : null}

      {insights.length === 0 ? (
        <Card>
          <EmptyState
            icon={CheckCircle2}
            title="Nenhum alerta operacional"
            description={`Não encontramos um sinal que ultrapasse os critérios definidos em ${periodLabel}. Continue registrando a operação para acompanhar tendências reais.`}
          />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}

      <Card className="border-dashed bg-background/60 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-control font-semibold text-foreground">Como os insights são calculados?</p>
            <p className="mt-1 max-w-2xl text-aux text-muted">
              O motor atual aplica regras transparentes sobre fila, faltas,
              cancelamentos, novos pacientes e distribuição de atendimentos.
              Modelos de IA só serão adicionados quando houver provedor e escopo
              de dados autorizados.
            </p>
          </div>
          <Button variant="secondary" asChild>
            <Link href="/relatorios">
              Ver dados-base
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Button>
        </div>
      </Card>
    </div>
  )
}

function InsightCard({ insight }: { insight: OperationalInsight }) {
  const meta = severityMeta[insight.severity]
  const Icon = meta.icon

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-field ${meta.iconClass}`}>
          <Icon aria-hidden className="size-5" />
        </span>
        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
      </div>
      <div>
        <h2 className="text-control font-semibold text-foreground">{insight.title}</h2>
        <p className="mt-1.5 text-aux leading-6 text-muted">{insight.description}</p>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border-card pt-4">
        <span className="text-label text-muted">Base: {insight.source}</span>
        <Button variant="ghost" asChild>
          <Link href={insight.href}>
            {insight.actionLabel}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </Button>
      </div>
    </Card>
  )
}
