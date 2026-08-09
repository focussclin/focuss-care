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

export type EncounterNotificationKind =
  | 'checked_in'
  | 'called'
  | 'started'
  | 'closed'

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
  const notification = toAppointmentNotification(input.kind, input.appointment)

  await createOperationalNotification({
    client: input.client,
    clinicId: input.clinicId,
    userId: input.userId,
    ...notification,
  })
}

export async function createEncounterNotification(input: {
  client: Client
  clinicId: string
  userId: string
  kind: EncounterNotificationKind
  patientName: string
  eventAt: string
}): Promise<void> {
  const labels: Record<EncounterNotificationKind, string> = {
    checked_in: 'chegou na recepção',
    called: 'foi chamado',
    started: 'entrou em atendimento',
    closed: 'teve o atendimento encerrado',
  }

  await createOperationalNotification({
    client: input.client,
    clinicId: input.clinicId,
    userId: input.userId,
    kind: `encounter.${input.kind}`,
    title: 'Atualização da recepção',
    body: `${input.patientName} ${labels[input.kind]} • ${formatOperationalDate(input.eventAt)}`,
    link: '/atendimentos',
  })
}

async function createOperationalNotification(input: {
  client: Client
  clinicId: string
  userId: string
  kind: string
  title: string
  body: string
  link: string
}): Promise<void> {
  const repository = notificationRepositoryFor(input.client)

  await repository.createForUser(input.clinicId, input.userId, {
    kind: input.kind,
    title: input.title,
    body: input.body,
    link: input.link,
  })
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
    body: `${appointment.patientName} • ${formatOperationalDate(appointment.startsAt)}`,
    link: '/agenda',
  }
}

function formatOperationalDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value))
}
