'use client'

import { Card } from '@/components/ui/card'
import { addDays, formatTime, isSameDay } from '@/lib/utils/date'
import { cn } from '@/lib/utils/cn'
import {
  appointmentStatusMeta,
  type Appointment,
} from '@/modules/_shared/domain/types'

import {
  blockClassesByTone,
  getBlockGeometry,
  getTimeLabels,
  GRID_HEIGHT,
  SLOT_HEIGHT,
} from './grid'

export interface WeekViewProps {
  weekStart: Date
  today: Date
  appointments: readonly Appointment[]
  onSelectAppointment: (appointment: Appointment) => void
}

const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const

/**
 * Visualizacao semanal — padrao no desktop.
 * Segunda a domingo, grade de 07:00 as 19:00 com intervalos de 30 minutos.
 * No mobile vira uma faixa horizontal rolavel, sem comprimir o conteudo.
 */
export function WeekView({
  weekStart,
  today,
  appointments,
  onSelectAppointment,
}: WeekViewProps) {
  const timeLabels = getTimeLabels()
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[52rem]">
          {/* Cabecalho dos dias */}
          <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b border-border-card">
            <div aria-hidden />
            {days.map((day, index) => {
              const isToday = isSameDay(day, today)

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'px-2 py-3 text-center',
                    isToday && 'bg-brand-subtle',
                  )}
                >
                  <p
                    className={cn(
                      'text-label font-semibold',
                      isToday ? 'text-brand' : 'text-muted',
                    )}
                  >
                    {WEEKDAY_SHORT[index]}
                  </p>
                  <p
                    className={cn(
                      'mt-0.5 text-aux font-semibold tabular-nums',
                      isToday ? 'text-brand' : 'text-foreground',
                    )}
                  >
                    {String(day.getDate()).padStart(2, '0')}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Grade */}
          <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
            {/* Coluna de horarios */}
            <div className="relative" style={{ height: GRID_HEIGHT }}>
              {timeLabels.map((label, index) => (
                <div
                  key={label}
                  className="absolute right-2 -translate-y-1/2 text-[12px] text-muted tabular-nums"
                  style={{ top: index * SLOT_HEIGHT }}
                >
                  {index % 2 === 0 ? label : null}
                </div>
              ))}
            </div>

            {days.map((day) => {
              const isToday = isSameDay(day, today)
              const dayAppointments = appointments.filter((appointment) =>
                isSameDay(appointment.startsAt, day),
              )

              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'relative border-l border-grid-line',
                    isToday && 'bg-brand-subtle/40',
                  )}
                  style={{ height: GRID_HEIGHT }}
                >
                  {/* Linhas de 30 em 30 minutos */}
                  {timeLabels.map((label, index) => (
                    <div
                      key={label}
                      className={cn(
                        'absolute inset-x-0 border-t',
                        index % 2 === 0
                          ? 'border-grid-line'
                          : 'border-grid-line/50',
                      )}
                      style={{ top: index * SLOT_HEIGHT }}
                    />
                  ))}

                  {dayAppointments.map((appointment) => {
                    const geometry = getBlockGeometry(appointment)
                    const status = appointmentStatusMeta[appointment.status]

                    return (
                      <button
                        key={appointment.id}
                        type="button"
                        onClick={() => onSelectAppointment(appointment)}
                        style={{
                          top: geometry.top,
                          height: geometry.height,
                        }}
                        className={cn(
                          'absolute inset-x-1 overflow-hidden rounded-[10px] border-l-[3px] px-2 py-1 text-left',
                          'transition-shadow hover:shadow-card',
                          blockClassesByTone[status.tone],
                        )}
                      >
                        <span className="block text-[11px] font-semibold tabular-nums">
                          {formatTime(appointment.startsAt)}
                        </span>
                        <span className="block truncate text-[12px] font-semibold">
                          {appointment.patientName}
                        </span>
                        {geometry.height > 58 ? (
                          <span className="block truncate text-[11px] opacity-80">
                            {appointment.type}
                          </span>
                        ) : null}
                        {geometry.height > 78 ? (
                          <span className="block truncate text-[11px] opacity-80">
                            {appointment.professionalName}
                          </span>
                        ) : null}
                        <span className="sr-only">
                          {`${appointment.type} com ${appointment.professionalName}. Status: ${status.label}.`}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Card>
  )
}
