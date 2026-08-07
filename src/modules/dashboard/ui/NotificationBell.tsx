import { Bell } from 'lucide-react'

import { cn } from '@/lib/utils/cn'

export interface NotificationBellProps {
  count: number
}

/**
 * DASHBOARD_DESIGN.md: "Sem notificacoes: nao exibir um badge vazio."
 * O indicador so aparece quando ha algo, e a contagem entra no nome acessivel.
 */
export function NotificationBell({ count }: NotificationBellProps) {
  const hasNotifications = count > 0

  return (
    <button
      type="button"
      aria-label={
        hasNotifications
          ? `Notificações: ${count} não lidas`
          : 'Notificações: nenhuma nova'
      }
      className={cn(
        'relative inline-flex size-11 items-center justify-center rounded-field',
        'border border-border-card bg-surface text-muted',
        'transition-colors hover:border-border-hover hover:text-foreground',
      )}
    >
      <Bell aria-hidden className="size-[18px]" strokeWidth={1.75} />

      {hasNotifications ? (
        <span
          aria-hidden
          className="absolute top-2.5 right-2.5 size-2 rounded-full bg-attention ring-2 ring-surface"
        />
      ) : null}
    </button>
  )
}
