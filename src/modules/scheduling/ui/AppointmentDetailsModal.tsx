'use client'

import { CalendarClock, Stethoscope, User } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDayHeading, formatTime } from '@/lib/utils/date'
import {
  appointmentStatusMeta,
  type Appointment,
} from '@/modules/_shared/domain/types'

export interface AppointmentDetailsModalProps {
  appointment: Appointment | null
  onOpenChange: (open: boolean) => void
  onReschedule: (appointment: Appointment) => void
  onCancel: (appointment: Appointment) => void
}

/**
 * Detalhes do atendimento sem sair da agenda.
 * O cancelamento passa por confirmacao explicita, conforme "Confirmar acoes
 * destrutivas, como cancelar, com uma mensagem clara".
 */
export function AppointmentDetailsModal({
  appointment,
  onOpenChange,
  onReschedule,
  onCancel,
}: AppointmentDetailsModalProps) {
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  if (!appointment) return null

  const status = appointmentStatusMeta[appointment.status]
  const endsAt = new Date(
    appointment.startsAt.getTime() + appointment.durationMinutes * 60_000,
  )

  function handleOpenChange(open: boolean) {
    if (!open) setConfirmingCancel(false)
    onOpenChange(open)
  }

  return (
    <Modal
      open
      onOpenChange={handleOpenChange}
      title="Detalhes do atendimento"
      footer={
        confirmingCancel ? (
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmingCancel(false)}
            >
              Manter atendimento
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                onCancel(appointment)
                setConfirmingCancel(false)
                onOpenChange(false)
              }}
            >
              Cancelar atendimento
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmingCancel(true)}
            >
              Cancelar atendimento
            </Button>
            <Button onClick={() => onReschedule(appointment)}>
              Reagendar
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-card-title font-semibold text-foreground">
              {appointment.patientName}
            </p>
            <p className="mt-0.5 text-aux text-muted">{appointment.type}</p>
          </div>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>

        <dl className="flex flex-col gap-3 rounded-field bg-background p-4">
          <DetailRow
            icon={<CalendarClock aria-hidden className="size-4 text-muted" />}
            label="Quando"
            value={`${formatDayHeading(appointment.startsAt)}, ${formatTime(appointment.startsAt)} às ${formatTime(endsAt)}`}
          />
          <DetailRow
            icon={<Stethoscope aria-hidden className="size-4 text-muted" />}
            label="Profissional"
            value={appointment.professionalName}
          />
          <DetailRow
            icon={<User aria-hidden className="size-4 text-muted" />}
            label="Duração"
            value={`${appointment.durationMinutes} minutos`}
          />
        </dl>

        {appointment.notes ? (
          <div>
            <p className="text-label font-semibold text-label">Observação</p>
            <p className="mt-1 text-aux text-muted">{appointment.notes}</p>
          </div>
        ) : null}

        {confirmingCancel ? (
          <p
            role="alert"
            className="rounded-field border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
          >
            Ao cancelar, o horário volta a ficar livre e o paciente precisará ser
            avisado. Esta ação não pode ser desfeita.
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0">
        <dt className="text-label text-muted">{label}</dt>
        <dd className="text-aux text-foreground first-letter:uppercase">
          {value}
        </dd>
      </div>
    </div>
  )
}
