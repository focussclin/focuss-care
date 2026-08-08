'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MoreVertical } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDayHeading, formatTime, isSameDay } from '@/lib/utils/date'
import {
  appointmentStatusMeta,
  type Appointment,
} from '@/modules/_shared/domain/types'

export interface ListViewProps {
  appointments: readonly Appointment[]
  today: Date
  onSelectAppointment: (appointment: Appointment) => void
  onReschedule: (appointment: Appointment) => void
  onCancel: (appointment: Appointment) => void
}

interface DayGroup {
  key: string
  date: Date
  items: Appointment[]
}

function groupByDay(appointments: readonly Appointment[]): DayGroup[] {
  const groups = new Map<string, DayGroup>()

  for (const appointment of appointments) {
    const key = appointment.startsAt.toDateString()
    const existing = groups.get(key)

    if (existing) {
      existing.items.push(appointment)
    } else {
      groups.set(key, {
        key,
        date: appointment.startsAt,
        items: [appointment],
      })
    }
  }

  return [...groups.values()].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  )
}

/**
 * Visualizacao em lista — padrao no mobile e alternativa de leitura rapida.
 * Agrupada por dia. O menu de tres pontos guarda apenas acoes secundarias; abrir o
 * atendimento continua sendo um clique direto na linha.
 */
export function ListView({
  appointments,
  today,
  onSelectAppointment,
  onReschedule,
  onCancel,
}: ListViewProps) {
  const groups = groupByDay(appointments)

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <Card key={group.key} className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border-card px-5 py-3.5">
            <h2 className="text-aux font-semibold text-foreground first-letter:uppercase">
              {formatDayHeading(group.date)}
            </h2>
            {isSameDay(group.date, today) ? (
              <span className="rounded-full bg-brand-subtle px-2.5 py-0.5 text-label font-semibold text-link">
                Hoje
              </span>
            ) : null}
          </div>

          <ul className="divide-y divide-border-card">
            {group.items.map((appointment) => {
              const status = appointmentStatusMeta[appointment.status]

              return (
                <li
                  key={appointment.id}
                  className="flex items-center gap-3 px-5 transition-colors hover:bg-row-hover"
                >
                  <button
                    type="button"
                    onClick={() => onSelectAppointment(appointment)}
                    className="flex min-h-[72px] flex-1 flex-wrap items-center gap-x-4 gap-y-1 py-3 text-left"
                  >
                    <span className="w-14 shrink-0 text-aux font-semibold text-foreground tabular-nums">
                      {formatTime(appointment.startsAt)}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-aux font-semibold text-foreground">
                        {appointment.patientName}
                      </span>
                      <span className="mt-0.5 block truncate text-label text-muted">
                        {appointment.type} · {appointment.professionalName}
                      </span>
                    </span>

                    <StatusBadge tone={status.tone}>
                      {status.label}
                    </StatusBadge>
                  </button>

                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger
                      aria-label={`Ações para o atendimento de ${appointment.patientName}`}
                      className="inline-flex size-11 shrink-0 items-center justify-center rounded-field text-muted transition-colors hover:bg-surface hover:text-foreground"
                    >
                      <MoreVertical aria-hidden className="size-4" />
                    </DropdownMenu.Trigger>

                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        align="end"
                        sideOffset={4}
                        className="z-50 min-w-[11rem] rounded-field border border-border-card bg-surface p-1 shadow-raised"
                      >
                        <DropdownMenu.Item
                          onSelect={() => onSelectAppointment(appointment)}
                          className="cursor-pointer rounded-[8px] px-3 py-2 text-aux text-foreground outline-none data-[highlighted]:bg-row-hover"
                        >
                          Editar
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          onSelect={() => onReschedule(appointment)}
                          className="cursor-pointer rounded-[8px] px-3 py-2 text-aux text-foreground outline-none data-[highlighted]:bg-row-hover"
                        >
                          Reagendar
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          onSelect={() => onCancel(appointment)}
                          className="cursor-pointer rounded-[8px] px-3 py-2 text-aux text-danger outline-none data-[highlighted]:bg-danger-surface"
                        >
                          Cancelar
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </li>
              )
            })}
          </ul>
        </Card>
      ))}
    </div>
  )
}
