import { cn } from '@/lib/utils/cn'

/**
 * Tons de status compartilhados por AGENDA_DESIGN.md e PATIENTS_DESIGN.md.
 * As duas telas usam a mesma escala, entao existe um unico componente.
 */
export type StatusTone = 'positive' | 'pending' | 'neutral' | 'negative'

const toneClasses: Record<StatusTone, string> = {
  positive: 'bg-status-positive-surface text-status-positive',
  pending: 'bg-status-pending-surface text-status-pending',
  neutral: 'bg-status-neutral-surface text-status-neutral',
  negative: 'bg-status-negative-surface text-status-negative',
}

export interface StatusBadgeProps {
  tone: StatusTone
  children: string
  className?: string
}

/**
 * O rotulo e sempre texto: os handoffs exigem que o status nao dependa so de cor.
 */
export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-label font-semibold whitespace-nowrap',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
