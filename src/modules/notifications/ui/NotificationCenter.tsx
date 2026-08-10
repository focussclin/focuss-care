'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Bell, Check, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { cn } from '@/lib/utils/cn'

import { markAllNotificationsReadAction } from '../actions/markAllNotificationsRead.action'
import { markNotificationReadAction } from '../actions/markNotificationRead.action'
import type { NotificationDto } from '../schemas/notification.schema'

export interface NotificationCenterProps {
  notifications: readonly NotificationDto[]
  unreadCount: number
}

export function NotificationCenter({
  notifications,
  unreadCount,
}: NotificationCenterProps) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function markRead(notification: NotificationDto) {
    if (notification.readAt || pendingId) return

    setError(null)
    setPendingId(notification.id)
    try {
      const result = await markNotificationReadAction({
        notificationId: notification.id,
      })
      if (result.ok) router.refresh()
      else setError(result.error.message)
    } catch {
      setError('Não foi possível atualizar a notificação agora.')
    } finally {
      setPendingId(null)
    }
  }

  async function markAllRead() {
    if (unreadCount === 0 || pendingId) return

    setError(null)
    setPendingId('__all__')
    try {
      const result = await markAllNotificationsReadAction({})
      if (result.ok) router.refresh()
      else setError(result.error.message)
    } catch {
      setError('Não foi possível atualizar as notificações agora.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={
            unreadCount > 0
              ? `Notificações: ${unreadCount} não lidas`
              : 'Notificações: nenhuma não lida'
          }
          className="relative inline-flex size-10 items-center justify-center rounded-[10px] text-muted transition-colors hover:bg-row-hover hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus"
        >
          <Bell aria-hidden className="size-[18px]" />
          {unreadCount > 0 ? (
            <span
              aria-hidden
              className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-white"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border-card bg-surface shadow-raised"
        >
          <div className="flex items-center justify-between border-b border-border-card px-4 py-3">
            <div>
              <DropdownMenu.Label className="text-aux font-semibold text-foreground">
                Notificações
              </DropdownMenu.Label>
              <p className="text-label text-muted">
                {unreadCount > 0
                  ? `${unreadCount} aguardando sua atenção`
                  : 'Tudo em dia por aqui'}
              </p>
            </div>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="rounded-field px-2 py-1 text-label font-semibold text-link transition-colors hover:bg-brand-subtle disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pendingId !== null}
                onClick={markAllRead}
              >
                {pendingId === '__all__' ? 'Atualizando...' : 'Marcar todas'}
              </button>
            ) : (
              <Check aria-hidden className="size-4 text-status-positive" />
            )}
          </div>

          {error ? (
            <p role="alert" className="border-b border-danger/20 bg-danger-surface px-4 py-2 text-label text-danger">
              {error}
            </p>
          ) : null}

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Bell aria-hidden className="mx-auto size-5 text-muted" />
              <p className="mt-3 text-aux font-semibold text-foreground">
                Nenhuma notificação
              </p>
              <p className="mt-1 text-label text-muted">
                Avisos gerados pela operação aparecerão aqui.
              </p>
            </div>
          ) : (
            <div className="max-h-[min(440px,65dvh)] overflow-y-auto p-1.5">
              {notifications.map((notification) => {
                const href = safeInternalLink(notification.link)
                const itemClass = cn(
                  'flex w-full items-start gap-3 rounded-lg px-2.5 py-2.5 text-left outline-none transition-colors hover:bg-row-hover focus-visible:bg-row-hover',
                  !notification.readAt && 'bg-brand-subtle/45',
                )

                const content = (
                  <>
                    <span
                      aria-hidden
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        notification.readAt ? 'bg-border-default' : 'bg-brand',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-aux font-semibold text-foreground">
                        {notification.title}
                      </span>
                      {notification.body ? (
                        <span className="mt-0.5 block text-label text-muted">
                          {notification.body}
                        </span>
                      ) : null}
                      <span className="mt-1 block text-[11px] text-muted">
                        {formatNotificationDate(notification.createdAt)}
                      </span>
                    </span>
                    {href ? (
                      <ExternalLink aria-hidden className="mt-1 size-3.5 shrink-0 text-muted" />
                    ) : null}
                  </>
                )

                return href ? (
                  <DropdownMenu.Item key={notification.id} asChild>
                    <Link
                      href={href}
                      className={itemClass}
                      onClick={() => void markRead(notification)}
                    >
                      {content}
                    </Link>
                  </DropdownMenu.Item>
                ) : (
                  <DropdownMenu.Item
                    key={notification.id}
                    className={itemClass}
                    disabled={pendingId !== null}
                    onSelect={() => void markRead(notification)}
                  >
                    {content}
                  </DropdownMenu.Item>
                )
              })}
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function safeInternalLink(link: string | null): string | null {
  if (!link || !link.startsWith('/') || link.startsWith('//')) return null
  return link
}

function formatNotificationDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}
