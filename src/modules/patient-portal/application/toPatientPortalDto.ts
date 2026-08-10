import type { StatusTone } from '@/components/ui/status-badge'
import { formatShortDate, formatTime } from '@/lib/utils/date'
import { formatCents } from '@/lib/utils/money'
import { appointmentStatusMeta } from '@/modules/_shared/domain/types'

import {
  isSettled,
  outstandingCents,
  type PortalAppointment,
  type PortalInvoice,
  type PortalInviteSummary,
  type PortalProfile,
} from '../domain/PatientPortal'
import type {
  PortalAppointmentDto,
  PortalInviteSummaryDto,
  PortalInvoiceDto,
  PortalProfileDto,
} from '../schemas/patientPortal.schema'

/**
 * Rótulos de cobrança escritos para o PACIENTE, não para o financeiro.
 *
 * `draft` vira "em preparação" porque "rascunho" descreve o trabalho da
 * clínica, não o estado do que ele deve. Pela mesma razão `issued` é "em
 * aberto": a pessoa quer saber se falta pagar, e não se a nota foi emitida.
 */
const INVOICE_LABELS: Record<
  PortalInvoice['status'],
  { label: string; tone: StatusTone }
> = {
  draft: { label: 'Em preparação', tone: 'neutral' },
  issued: { label: 'Em aberto', tone: 'pending' },
  partially_paid: { label: 'Parcialmente paga', tone: 'pending' },
  paid: { label: 'Paga', tone: 'positive' },
  overdue: { label: 'Vencida', tone: 'negative' },
}

const INVITE_LABELS: Record<
  PortalInviteSummary['status'],
  { label: string; tone: StatusTone }
> = {
  pending: { label: 'Pendente', tone: 'pending' },
  accepted: { label: 'Ativo', tone: 'positive' },
  revoked: { label: 'Cancelado', tone: 'neutral' },
}

export function toPortalProfileDto(profile: PortalProfile): PortalProfileDto {
  return {
    patientId: profile.patientId,
    clinicName: profile.clinicName,
    displayName: profile.displayName,
    legalName: profile.legalName,
    birthLabel: profile.birthDate ? formatShortDate(profile.birthDate) : null,
    email: profile.email,
    phone: profile.phone,
  }
}

export function toPortalAppointmentDto(
  appointment: PortalAppointment,
): PortalAppointmentDto {
  const status = appointmentStatusMeta[appointment.status]

  return {
    id: appointment.id,
    dayLabel: formatShortDate(appointment.startsAt),
    timeLabel: `${formatTime(appointment.startsAt)} – ${formatTime(appointment.endsAt)}`,
    statusLabel: status.label,
    statusTone: status.tone,
    professionalName: appointment.professionalName,
    reason: appointment.reason,
    startsAt: appointment.startsAt.toISOString(),
  }
}

export function toPortalInvoiceDto(invoice: PortalInvoice): PortalInvoiceDto {
  const settled = isSettled(invoice)
  const meta = INVOICE_LABELS[invoice.status]

  return {
    id: invoice.id,
    /*
     * O SALDO vence o status.
     *
     * `paid`/`partially_paid` são escritos pelo financeiro e podem ficar para
     * trás de um pagamento recém-registrado. Dizer "em aberto" para quem já
     * pagou é o erro que gera ligação — e desconfiança, que é mais caro.
     */
    statusLabel: settled ? 'Paga' : meta.label,
    statusTone: settled ? 'positive' : meta.tone,
    totalLabel: formatCents(invoice.totalCents),
    outstandingLabel: settled
      ? null
      : formatCents(outstandingCents(invoice)),
    dueLabel: invoice.dueDate ? formatShortDate(invoice.dueDate) : null,
    isSettled: settled,
  }
}

export function toPortalInviteSummaryDto(
  invite: PortalInviteSummary,
): PortalInviteSummaryDto {
  const meta = INVITE_LABELS[invite.status]

  return {
    id: invite.id,
    email: invite.email,
    status: invite.status,
    statusLabel: meta.label,
    statusTone: meta.tone,
    detailLabel:
      invite.status === 'accepted' && invite.acceptedAt
        ? `aceito em ${formatShortDate(invite.acceptedAt)}`
        : invite.status === 'pending'
          ? `vence em ${formatShortDate(invite.expiresAt)}`
          : `criado em ${formatShortDate(invite.createdAt)}`,
  }
}
