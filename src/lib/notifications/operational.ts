import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'
import { notificationRepositoryFor } from '@/modules/notifications/infrastructure/repository'

type Client = SupabaseClient<Database>

export interface AppointmentNotificationData {
  patientName: string
  startsAt: string
}

export type AppointmentNotificationKind =
  | 'created'
  | 'rescheduled'
  | 'canceled'

/**
 * Registra um evento operacional para quem executou a aÃ§Ã£o.
 *
 * A funÃ§Ã£o recebe somente dados jÃ¡ devolvidos pela leitura tenant-scoped da
 * agenda. Texto clÃ­nico, motivo e observaÃ§Ãµes nunca entram no aviso.
 */
export async function createAppointmentNotification(input: {
  client: Client
  clinicId: string
  userId: string
  kind: AppointmentNotificationKind
  appointment: AppointmentNotificationData
}): Promise<void> {
  const repository = notificationRepositoryFor(input.client)
  const notification = toAppointmentNotification(input.kind, input.appointment)

  await repository.createForUser(
    input.clinicId,
    input.userId,
    notification,
  )
}

function toAppointmentNotification(
  kind: AppointmentNotificationKind,
  appointment: AppointmentNotificationData,
) {
  const labels: Record<AppointmentNotificationKind, string> = {
    created: 'criado',
    rescheduled: 'remarcado',
    canceled: 'cancelado',
  }
  const label = labels[kind]

  return {
    kind: `appointment.${kind}`,
    title: `Agendamento ${label}`,
    body: `${appointment.patientName} â€¢ ${formatAppointmentDate(appointment.startsAt)}`,
    link: '/agenda',
  }
}

function formatAppointmentDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}
