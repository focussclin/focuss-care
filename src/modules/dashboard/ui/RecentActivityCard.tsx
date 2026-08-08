import { Activity } from 'lucide-react'
import Link from 'next/link'

import { Avatar } from '@/components/ui/avatar'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatRelativeTime } from '@/lib/utils/date'
import type { ActivityEntry } from '@/modules/_shared/domain/types'

export interface RecentActivityCardProps {
  entries: readonly ActivityEntry[]
  /** Referencia para o tempo relativo — vem do servidor para evitar divergencia. */
  now: Date
}

/** Limite de cinco itens definido em DASHBOARD_DESIGN.md. */
const MAX_ENTRIES = 5

export function RecentActivityCard({ entries, now }: RecentActivityCardProps) {
  const visible = entries.slice(0, MAX_ENTRIES)

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Atividade recente"
        action={
          <Link
            href="/relatorios"
            className="text-label font-semibold text-link hover:underline"
          >
            Ver tudo
          </Link>
        }
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="Nenhuma atividade por aqui ainda."
          description="As movimentações da equipe aparecem nesta lista."
        />
      ) : (
        <ul className="flex flex-col px-5 pb-5">
          {visible.map((entry) => (
            <li key={entry.id} className="flex items-start gap-3 py-3">
              <Avatar name={entry.actorName} size="sm" />

              <div className="min-w-0 flex-1">
                <p className="text-aux text-muted">
                  <span className="font-semibold text-foreground">
                    {entry.actorName}
                  </span>{' '}
                  {entry.description}
                </p>
                <p className="mt-0.5 text-label text-muted">
                  {formatRelativeTime(entry.occurredAt, now)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
