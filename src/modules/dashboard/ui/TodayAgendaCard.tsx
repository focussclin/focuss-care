import { CalendarPlus, CalendarRange } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatTime } from '@/lib/utils/date'
import {
  appointmentStatusMeta,
  type Appointment,
} from '@/modules/_shared/domain/types'

export interface TodayAgendaCardProps {
  appointments: readonly Appointment[]
  /** Rotulo do seletor de data ("Hoje", "08 de agosto"...). */
  dateLabel: string
}

/**
 * Agenda do dia no dashboard.
 * DASHBOARD_DESIGN.md: horario em destaque, paciente, tipo, profissional e tag de
 * status, com uma linha vertical verde suave conectando os horarios.
 */
export function TodayAgendaCard({
  appointments,
  dateLabel,
}: TodayAgendaCardProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Agenda de hoje"
        action={
          <>
            <span className="rounded-full bg-brand-subtle px-3 py-1 text-label font-semibold text-link">
              {dateLabel}
            </span>
            <Link
              href="/agenda"
              className="text-label font-semibold text-link hover:underline"
            >
              Ver agenda completa
            </Link>
          </>
        }
      />

      {appointments.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="Sua agenda está livre por enquanto."
          action={
            <Button asChild>
              <Link href="/agenda">
                <CalendarPlus aria-hidden className="size-4" />
                Adicionar atendimento
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="relative flex flex-col px-5 pb-5">
          {/* Linha vertical que conecta os horarios */}
          <span
            aria-hidden
            className="absolute top-2 bottom-7 left-[4.35rem] w-px bg-brand-soft"
          />

          {appointments.map((appointment) => {
            const status = appointmentStatusMeta[appointment.status]

            return (
              <li
                key={appointment.id}
                className="relative flex items-start gap-4 py-3.5"
              >
                <span className="w-12 shrink-0 pt-0.5 text-aux font-semibold text-foreground tabular-nums">
                  {formatTime(appointment.startsAt)}
                </span>

                <span
                  aria-hidden
                  className="relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-surface bg-brand-accent"
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-aux font-semibold text-foreground">
                    {appointment.patientName}
                  </p>
                  <p className="mt-0.5 truncate text-label text-muted">
                    {appointment.type} · {appointment.professionalName}
                  </p>
                </div>

                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
