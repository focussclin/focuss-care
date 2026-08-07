import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

export interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  /** Botao ou link de acao. */
  action?: ReactNode
  className?: string
}

/**
 * Estado vazio / erro / sem resultado. Icone linear discreto, conforme handoffs.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-12 text-center',
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-brand-subtle">
        <Icon aria-hidden className="size-5 text-link" strokeWidth={1.75} />
      </span>

      <p className="mt-4 text-control font-semibold text-foreground">{title}</p>

      {description ? (
        <p className="mt-1 max-w-sm text-aux text-muted">{description}</p>
      ) : null}

      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
