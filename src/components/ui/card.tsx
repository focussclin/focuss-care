import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

/**
 * Superficie padrao das telas internas.
 * DASHBOARD/AGENDA/PATIENTS_DESIGN.md: fundo branco, borda #E1E9E4, raio 16px,
 * sombra quase imperceptivel.
 */
export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-card border border-border-card bg-surface shadow-card',
        className,
      )}
      {...props}
    />
  )
}

export interface CardHeaderProps {
  title: string
  /** Renderizado a direita do titulo (link "Ver tudo", seletor de data etc.). */
  action?: ReactNode
  description?: string
  className?: string
}

export function CardHeader({
  title,
  action,
  description,
  className,
}: CardHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-card-title font-semibold text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-label text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  )
}
