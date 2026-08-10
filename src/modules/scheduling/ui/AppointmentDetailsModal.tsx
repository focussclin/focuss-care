'use client'

import { CalendarClock, DoorOpen, Stethoscope, User } from 'lucide-react'

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
  /**
   * Cancela, e NÃO fecha o modal.
   *
   * Quem fecha é a tela, e só depois de o servidor confirmar. Enquanto esta
   * promessa não resolve, o modal continua aberto com o botão travado — é o que
   * dá lugar para a recusa aparecer.
   */
  onCancel: (appointment: Appointment) => void | Promise<void>
  /**
   * Recusa do cancelamento pelo servidor.
   *
   * Chega por prop porque o modal não fala com o servidor — quem chama a action
   * é a tela. Sem isto, uma recusa fecharia o modal em silêncio e o atendimento
   * continuaria marcado sem ninguém saber por quê.
   */
  cancelError?: string | null
  /**
   * Passo de confirmação, CONTROLADO pela tela.
   *
   * Era `useState` daqui dentro, e por isso o menu da lista não tinha como
   * chegar nele: "Cancelar" no dropdown chamava a action direto, sem passar por
   * confirmação nenhuma. Com o estado na tela, os dois caminhos entram no mesmo
   * lugar — o da lista já abre confirmando.
   */
  confirmingCancel: boolean
  onConfirmingCancelChange: (confirming: boolean) => void
  /** Cancelamento em voo: trava os botões e evita disparo duplicado. */
  isCanceling?: boolean
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
  cancelError = null,
  confirmingCancel,
  onConfirmingCancelChange,
  isCanceling = false,
}: AppointmentDetailsModalProps) {
  if (!appointment) return null

  const status = appointmentStatusMeta[appointment.status]
  const endsAt = new Date(
    appointment.startsAt.getTime() + appointment.durationMinutes * 60_000,
  )

  function handleOpenChange(open: boolean) {
    // Fechar no meio do cancelamento deixaria a recusa sem lugar para aparecer.
    if (isCanceling) return
    if (!open) onConfirmingCancelChange(false)
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
              disabled={isCanceling}
              onClick={() => onConfirmingCancelChange(false)}
            >
              Manter atendimento
            </Button>
            {/*
              NÃO fecha o modal aqui.

              Antes, este botão chamava `onCancel(appointment)` — uma promessa —
              e em seguida `onOpenChange(false)`, sem esperar. O modal
              desmontava antes de a action responder, então `cancelError`
              **nunca** chegava a renderizar: uma recusa do servidor deixava o
              atendimento marcado e a tela dizendo que tudo deu certo.

              Quem fecha agora é a tela, e só depois de o servidor confirmar.
            */}
            <Button
              variant="danger"
              disabled={isCanceling}
              onClick={() => onCancel(appointment)}
            >
              {isCanceling ? 'Cancelando…' : 'Cancelar atendimento'}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              onClick={() => onConfirmingCancelChange(true)}
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

          {/*
            A sala aparece AQUI sempre que existir, sem restrição de espaço.

            É o que sustenta a decisão da grade semanal: lá o bloco de 30
            minutos não tem altura para uma quarta linha, e o comentário
            justifica a omissão dizendo que quem precisa da sala abre o
            atendimento. Se este lugar não a mostrasse, aquela justificativa
            seria falsa e a informação não existiria em canto nenhum.
          */}
          {appointment.roomName ? (
            <DetailRow
              icon={<DoorOpen aria-hidden className="size-4 text-muted" />}
              label="Sala"
              value={appointment.roomName}
            />
          ) : null}
        </dl>

        {appointment.notes ? (
          <div>
            <p className="text-label font-semibold text-label">Observação</p>
            <p className="mt-1 text-aux text-muted">{appointment.notes}</p>
          </div>
        ) : null}

        {/*
          `status`, e não `alert`: isto EXPLICA o passo em que a pessoa acabou
          de entrar, e o `alert` logo abaixo é a recusa do servidor. Dois
          `role="alert"` no mesmo diálogo fazem o leitor de tela interromper
          duas vezes seguidas, e a segunda — a que importa — chega como se
          fosse repetição da primeira.
        */}
        {confirmingCancel ? (
          <p
            role="status"
            className="rounded-field border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
          >
            Ao cancelar, o horário volta a ficar livre e o paciente precisará ser
            avisado. Esta ação não pode ser desfeita.
          </p>
        ) : null}

        {/*
          Recusa do servidor. Sem isto o modal fecharia em silêncio e o
          atendimento continuaria marcado, sem ninguém saber por quê.
        */}
        {cancelError ? (
          <p
            role="alert"
            className="rounded-field border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
          >
            {cancelError}
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
