'use client'

import {
  CalendarClock,
  CheckCheck,
  DoorOpen,
  Stethoscope,
  User,
  UserCheck,
  UserX,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDayHeading, formatTime } from '@/lib/utils/date'
import {
  appointmentStatusMeta,
  type Appointment,
} from '@/modules/_shared/domain/types'

import {
  canConfirm,
  canRecordOutcome,
  outcomeIsDue,
  type AppointmentOutcome,
} from '../domain/AppointmentLifecycle'

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

  // ---------------------------------------------------------------------------
  // Ciclo de vida — feature A-03
  // ---------------------------------------------------------------------------

  /** `scheduled` -> `confirmed`. Carimba `confirmed_at` no servidor. */
  onConfirm: (appointment: Appointment) => void | Promise<void>
  /** Veio (`completed`) ou não veio (`no_show`). */
  onRecordOutcome: (
    appointment: Appointment,
    outcome: AppointmentOutcome,
  ) => void | Promise<void>
  /**
   * Recusa do servidor nas transições de estado.
   *
   * Separada de `cancelError` porque as duas aparecem em lugares diferentes do
   * diálogo: esta ao lado dos botões de situação, aquela junto da confirmação de
   * cancelamento. Uma única prop faria a recusa de "registrar falta" surgir sob
   * o texto que fala em cancelar.
   */
  lifecycleError?: string | null
  /** Transição em voo: trava os botões e evita disparo duplicado. */
  isUpdatingLifecycle?: boolean
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
  onConfirm,
  onRecordOutcome,
  lifecycleError = null,
  isUpdatingLifecycle = false,
}: AppointmentDetailsModalProps) {
  if (!appointment) return null

  const status = appointmentStatusMeta[appointment.status]
  const endsAt = new Date(
    appointment.startsAt.getTime() + appointment.durationMinutes * 60_000,
  )

  /*
   * `new Date()` no render é seguro AQUI: o modal só monta depois de um clique,
   * já no cliente. Não há HTML de servidor para divergir.
   */
  const showConfirm = canConfirm(appointment.status)
  const outcomeAllowed = canRecordOutcome(appointment.status)
  const outcomeDue = outcomeIsDue(appointment.startsAt, new Date())
  const showLifecycle = showConfirm || outcomeAllowed

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

        {/*
          Situação do atendimento — feature A-03.

          Fica no CORPO, e não no rodapé: o rodapé já carrega cancelar e
          reagendar, e cinco botões lado a lado numa faixa deixariam "Faltou" a
          um pixel de "Cancelar atendimento" — dois atos irreversíveis e
          diferentes. Aqui as transições ficam encostadas no selo de status, que
          é o que elas mudam.
        */}
        {showLifecycle ? (
          <section
            aria-label="Situação do atendimento"
            className="flex flex-col gap-2 rounded-field border border-border-card p-4"
          >
            <p className="text-label font-semibold text-label">Situação</p>

            <div className="flex flex-wrap gap-2">
              {showConfirm ? (
                <Button
                  variant="secondary"
                  disabled={isUpdatingLifecycle || isCanceling}
                  onClick={() => onConfirm(appointment)}
                >
                  <CheckCheck aria-hidden className="size-4" />
                  Confirmar presença
                </Button>
              ) : null}

              {outcomeAllowed && outcomeDue ? (
                <>
                  <Button
                    variant="secondary"
                    disabled={isUpdatingLifecycle || isCanceling}
                    onClick={() => onRecordOutcome(appointment, 'completed')}
                  >
                    <UserCheck aria-hidden className="size-4" />
                    Compareceu
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={isUpdatingLifecycle || isCanceling}
                    onClick={() => onRecordOutcome(appointment, 'no_show')}
                  >
                    <UserX aria-hidden className="size-4" />
                    Faltou
                  </Button>
                </>
              ) : null}
            </div>

            {/*
              Diz por que os botões de desfecho não estão aqui, em vez de
              mostrá-los desabilitados sem explicação. E a frase importa: quem
              registra falta libera o horário, e é isso que a recepção quer
              saber.
            */}
            {outcomeAllowed && !outcomeDue ? (
              <p className="text-label text-muted">
                O desfecho — compareceu ou faltou — pode ser registrado a partir do
                horário marcado. Registrar falta devolve o horário à agenda.
              </p>
            ) : null}

            {lifecycleError ? (
              <p
                role="alert"
                className="rounded-field border border-danger/30 bg-danger-surface px-3 py-2 text-aux text-danger"
              >
                {lifecycleError}
              </p>
            ) : null}
          </section>
        ) : null}

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
