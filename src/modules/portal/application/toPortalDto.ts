import { formatShortDate, formatTime } from '@/lib/utils/date'
import { appointmentStatusMeta } from '@/modules/_shared/domain/types'
import type { Appointment } from '@/modules/_shared/domain/types'

import { isOverdue, type PortalTask, type ProfessionalSummary } from '../domain/ProfessionalDay'
import type {
  PortalAppointmentDto,
  PortalSummaryDto,
  PortalTaskDto,
} from '../schemas/portal.schema'

/** Converte o atendimento para o contrato serializável da tela. */
export function toPortalAppointmentDto(
  appointment: Appointment,
): PortalAppointmentDto {
  const status = appointmentStatusMeta[appointment.status]
  const endsAt = new Date(
    appointment.startsAt.getTime() + appointment.durationMinutes * 60_000,
  )

  return {
    id: appointment.id,
    patientId: appointment.patientId,
    patientName: appointment.patientName,
    type: appointment.type,
    timeLabel: formatTime(appointment.startsAt),
    windowLabel: `${formatTime(appointment.startsAt)} – ${formatTime(endsAt)}`,
    durationMinutes: appointment.durationMinutes,
    statusLabel: status.label,
    statusTone: status.tone,
    startsAt: appointment.startsAt.toISOString(),
  }
}

export function toPortalTaskDto(task: PortalTask, now: Date): PortalTaskDto {
  return {
    id: task.id,
    title: task.title,
    dueLabel: task.dueAt ? dueLabel(task.dueAt, now) : null,
    isOverdue: isOverdue(task, now),
    priority: task.priority,
    patientName: task.patientName,
  }
}

export function toPortalSummaryDto(
  summary: ProfessionalSummary,
): PortalSummaryDto {
  return { ...summary }
}

/**
 * Prazo em palavras, e não em data seca.
 *
 * "12/08" obriga quem lê a calcular quantos dias faltam, entre um paciente e
 * outro. "vence amanhã" já é a resposta. A data continua disponível para o
 * caso que a frase não cobre — prazo distante, onde "em 23 dias" diz menos que
 * o dia exato.
 */
function dueLabel(dueAt: Date, now: Date): string {
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)

  const startOfDue = new Date(dueAt)
  startOfDue.setHours(0, 0, 0, 0)

  const days = Math.round(
    (startOfDue.getTime() - startOfToday.getTime()) / 86_400_000,
  )

  if (days === 0) return 'vence hoje'
  if (days === 1) return 'vence amanhã'
  if (days === -1) return 'venceu ontem'
  if (days < -1) return `venceu há ${Math.abs(days)} dias`
  if (days <= 7) return `vence em ${days} dias`

  return `vence em ${formatShortDate(dueAt)}`
}
