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

export type BillingNotificationKind =
  | 'invoice_created'
  | 'payment_registered'
  | 'invoice_canceled'
  | 'payable_created'
  | 'payable_settled'

export type CashNotificationKind = 'opened' | 'entry' | 'closed'

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

export async function createBillingNotification(input: {
  client: Client
  clinicId: string
  userId: string
  kind: BillingNotificationKind
  patientName?: string
  amountCents: number
}): Promise<void> {
  const labels: Record<BillingNotificationKind, string> = {
    invoice_created: 'Cobrança criada',
    payment_registered: 'Pagamento registrado',
    invoice_canceled: 'Cobrança cancelada',
    payable_created: 'Conta a pagar criada',
    payable_settled: 'Conta a pagar paga',
  }
  const subject = input.patientName ? `${input.patientName} • ` : ''

  await createOperationalNotification({
    client: input.client,
    clinicId: input.clinicId,
    userId: input.userId,
    kind: `billing.${input.kind}`,
    title: labels[input.kind],
    body: `${subject}${formatCents(input.amountCents)}`,
    link: '/financeiro',
  })
}

export async function createCashNotification(input: {
  client: Client
  clinicId: string
  userId: string
  kind: CashNotificationKind
  amountCents?: number
  entryKind?: string
  differenceCents?: number
}): Promise<void> {
  const body =
    input.kind === 'opened'
      ? `Saldo inicial ${formatCents(input.amountCents ?? 0)}`
      : input.kind === 'entry'
        ? `${input.entryKind === 'in' ? 'Entrada' : 'Saída'} de ${formatCents(input.amountCents ?? 0)}`
        : `Diferença de ${formatCents(input.differenceCents ?? 0)}`

  await createOperationalNotification({
    client: input.client,
    clinicId: input.clinicId,
    userId: input.userId,
    kind: `billing.cash_${input.kind}`,
    title:
      input.kind === 'opened'
        ? 'Caixa aberto'
        : input.kind === 'entry'
          ? 'Lançamento no caixa'
          : 'Caixa fechado',
    body,
    link: '/financeiro',
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

  const preferences = await repository.getPreferences(input.clinicId)
  if (!preferences.operational) return

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

function formatCents(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value / 100)
}
