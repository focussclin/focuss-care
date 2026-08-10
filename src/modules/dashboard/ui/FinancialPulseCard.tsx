import { AlertTriangle, ArrowUpRight, WalletCards } from 'lucide-react'
import Link from 'next/link'

import { Card, CardHeader } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatCents } from '@/lib/utils/money'

import type { FinancialPulse } from '../application/financialPulse'

export interface FinancialPulseCardProps {
  pulse: FinancialPulse
}

/**
 * Um único sinal financeiro no cockpit, sem transformar o Dashboard em um
 * segundo Financeiro. Os números chegam resumidos da rota, depois de passarem
 * pela permissão financeira e pelo repositório tenant-scoped.
 */
export function FinancialPulseCard({ pulse }: FinancialPulseCardProps) {
  return (
    <Card>
      <CardHeader
        title="Pulso financeiro"
        description="Contas a pagar com vencimento próximo ou atrasado."
        action={
          <Link
            href="/financeiro"
            className="inline-flex items-center gap-1 text-label font-semibold text-link hover:underline"
          >
            Abrir financeiro
            <ArrowUpRight aria-hidden className="size-3.5" />
          </Link>
        }
      />

      <div className="grid gap-4 px-5 pb-5 sm:grid-cols-3">
        <div className="rounded-card border border-border-card bg-background p-4">
          <WalletCards aria-hidden className="size-4 text-link" />
          <p className="mt-3 text-metric font-semibold text-foreground">
            {formatCents(pulse.openCents)}
          </p>
          <p className="mt-1 text-label text-muted">em aberto</p>
        </div>

        <div className="rounded-card border border-border-card bg-background p-4">
          <AlertTriangle aria-hidden className="size-4 text-attention" />
          <p className="mt-3 text-metric font-semibold text-attention">
            {formatCents(pulse.overdueCents)}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <p className="text-label text-muted">vencido</p>
            <StatusBadge tone={pulse.overdueCount > 0 ? 'negative' : 'neutral'}>
              {`${pulse.overdueCount} ${pulse.overdueCount === 1 ? 'conta' : 'contas'}`}
            </StatusBadge>
          </div>
        </div>

        <div className="rounded-card border border-border-card bg-background p-4">
          <p className="text-label font-semibold text-muted">Próximos 7 dias</p>
          <p className="mt-3 text-metric font-semibold text-foreground">
            {formatCents(pulse.dueSoonCents)}
          </p>
          <p className="mt-1 text-label text-muted">
            {pulse.dueSoonCount}{' '}
            {pulse.dueSoonCount === 1 ? 'vencimento' : 'vencimentos'}
          </p>
        </div>
      </div>
    </Card>
  )
}
