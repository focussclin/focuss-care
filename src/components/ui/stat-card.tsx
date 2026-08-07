import type { LucideIcon } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils/cn'

export interface StatCardProps {
  label: string
  value: string
  icon: LucideIcon
  /** Variacao percentual, ex.: "+12%". */
  trend?: string
  /** 'attention' destaca o card em tom de alerta suave. */
  tone?: 'default' | 'attention'
}

/**
 * Card de metrica do resumo do dia.
 * DASHBOARD_DESIGN.md: numero em 26px/650, icone em circulo de 36px com fundo
 * #E5F1E9, sem graficos chamativos. Nao e clicavel — o handoff proibe card de
 * metrica clicavel sem indicacao visual.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  tone = 'default',
}: StatCardProps) {
  const isAttention = tone === 'attention'

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-full',
            isAttention ? 'bg-attention-surface' : 'bg-brand-subtle',
          )}
        >
          <Icon
            aria-hidden
            className={cn(
              'size-[18px]',
              isAttention ? 'text-attention' : 'text-link',
            )}
            strokeWidth={1.75}
          />
        </span>

        {trend ? (
          <span className="rounded-full bg-status-positive-surface px-2 py-0.5 text-label font-semibold text-status-positive">
            {trend}
          </span>
        ) : null}
      </div>

      <p
        className={cn(
          'mt-4 text-metric font-semibold tracking-[-0.01em]',
          isAttention ? 'text-attention' : 'text-foreground',
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-aux text-muted">{label}</p>
    </Card>
  )
}

export function StatCardSkeleton() {
  return (
    <Card className="p-5">
      <Skeleton className="size-9 rounded-full" />
      <Skeleton className="mt-4 h-7 w-16" />
      <Skeleton className="mt-2 h-4 w-28" />
    </Card>
  )
}
