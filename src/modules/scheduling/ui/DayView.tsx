'use client'

import { Plus } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils/cn'
import { formatDayHeading, formatTime, isSameDay } from '@/lib/utils/date'
import {
  appointmentStatusMeta,
  type Appointment,
} from '@/modules/_shared/domain/types'

import { getTimeLabels } from './grid'

export interface DayViewProps {
  date: Date
  today: Date
  appointments: readonly Appointment[]
  onSelectAppointment: (appointment: Appointment) => void
  onCreateAt: (time: string) => void
}

/**
 * Visualizacao diaria: lista vertical com bastante respiro, compromissos largos com
 * todos os detalhes e, nos horarios livres, uma acao discreta que aparece no hover
 * ou no foco por teclado (AGENDA_DESIGN.md, secao "Visualizacao diaria").
 */
export function DayView({
  date,
  today,
  appointments,
  onSelectAppointment,
  onCreateAt,
}: DayViewProps) {
  const isToday = isSameDay(date, today)
  const timeLabels = getTimeLabels()

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border-card px-5 py-4">
        <h2 className="text-card-title font-semibold text-foreground first-letter:uppercase">
          {formatDayHeading(date)}
        </h2>
        {isToday ? (
          <span className="rounded-full bg-brand-subtle px-2.5 py-1 text-label font-semibold text-link">
            Hoje
          </span>
        ) : null}
      </div>

      <ul className="divide-y divide-grid-line">
        {timeLabels.map((label) => {
          const slotAppointments = appointments.filter(
            (appointment) => formatTime(appointment.startsAt) === label,
          )

          return (
            <li key={label} className="group flex items-stretch gap-4 px-5">
              <span className="w-12 shrink-0 pt-4 text-[12px] text-muted tabular-nums">
                {label}
              </span>

              <div className="min-w-0 flex-1 py-2">
                {slotAppointments.length > 0 ? (
                  slotAppointments.map((appointment) => {
                    const status = appointmentStatusMeta[appointment.status]

                    return (
                      <button
                        key={appointment.id}
                        type="button"
                        onClick={() => onSelectAppointment(appointment)}
                        className={cn(
                          'flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border border-border-card',
                          'bg-surface px-4 py-3 text-left transition-colors hover:bg-row-hover',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-aux font-semibold text-foreground">
                            {appointment.patientName}
                          </span>
                          <span className="mt-0.5 block truncate text-label text-muted">
                            {appointment.type} · {appointment.professionalName}
                            {' · '}
                            {appointment.durationMinutes} min
                            {/*
                              Sem sala não mostra NADA — nem "sem sala".
                              O vínculo é opcional e a maioria dos atendimentos
                              não tem sala; um rótulo de ausência repetido em
                              toda linha da agenda seria ruído sobre o caso
                              normal.
                            */}
                            {appointment.roomName ? (
                              <> · {appointment.roomName}</>
                            ) : null}
                          </span>
                        </span>

                        <StatusBadge tone={status.tone}>
                          {status.label}
                        </StatusBadge>
                      </button>
                    )
                  })
                ) : (
                  <button
                    type="button"
                    onClick={() => onCreateAt(label)}
                    className={cn(
                      'flex h-11 w-full items-center gap-2 rounded-[10px] px-4 text-label text-muted',
                      'opacity-0 transition-opacity hover:bg-row-hover',
                      'group-hover:opacity-100 focus-visible:opacity-100',
                    )}
                  >
                    <Plus aria-hidden className="size-3.5" />
                    Adicionar atendimento
                    <span className="sr-only">{` às ${label}`}</span>
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
