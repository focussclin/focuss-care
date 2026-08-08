import { Bell } from 'lucide-react'

import { cn } from '@/lib/utils/cn'

export interface NotificationBellProps {
  count: number
}

export function NotificationBell({ count }: NotificationBellProps) {
  const hasNotifications = count > 0

  return (
    <button
      type="button"
      aria-label={
        hasNotifications
          ? `Notificações: ${count} não lidas — em breve`
          : 'Notificações: nenhuma nova — em breve'
      }
      title="Notificações — em breve"
      disabled
      className={cn(
        'relative inline-flex size-11 cursor-not-allowed items-center justify-center rounded-field opacity-75',
        'border border-border-card bg-surface text-muted',
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
