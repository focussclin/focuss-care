import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, NotificationRow } from '@/lib/supabase/database.types'

import type { Notification } from '../domain/Notification'
import type {
  CreateNotificationInput,
  NotificationRepository,
} from '../domain/NotificationRepository'

type Client = SupabaseClient<Database>

const SELECT = 'id, kind, title, body, link, read_at, created_at'
const MAX_LIMIT = 50

export class SupabaseNotificationRepository implements NotificationRepository {
  constructor(private readonly client: Client) {}

  async createForUser(
    clinicId: string,
    userId: string,
    input: CreateNotificationInput,
  ): Promise<Notification> {
    const { data, error } = await this.client
      .from('notifications')
      .insert({
        clinic_id: clinicId,
        user_id: userId,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      })
      .select(SELECT)
      .single()

    if (error) throw writeFailure('createForUser', error)

    return toNotification(data as NotificationRow)
  }

  async listForUser(
    clinicId: string,
    userId: string,
    limit: number,
  ): Promise<Notification[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 1, 1), MAX_LIMIT)
    const { data, error } = await this.client
      .from('notifications')
      .select(SELECT)
      .eq('clinic_id', clinicId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(safeLimit)

    if (error) throw readFailure('listForUser', error)

    return ((data ?? []) as NotificationRow[]).map(toNotification)
  }

  async countUnread(clinicId: string, userId: string): Promise<number> {
    const { count, error } = await this.client
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('user_id', userId)
      .is('read_at', null)

    if (error) throw readFailure('countUnread', error)

    return count ?? 0
  }

  async markRead(
    clinicId: string,
    userId: string,
    notificationId: string,
  ): Promise<Notification | null> {
    const { data, error } = await this.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('clinic_id', clinicId)
      .eq('user_id', userId)
      .eq('id', notificationId)
      .is('read_at', null)
      .select(SELECT)
      .maybeSingle()

    if (error) throw writeFailure('markRead', error)

    return data ? toNotification(data as NotificationRow) : null
  }

  async markAllRead(clinicId: string, userId: string): Promise<number> {
    const { data, error } = await this.client
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('clinic_id', clinicId)
      .eq('user_id', userId)
      .is('read_at', null)
      .select('id')

    if (error) throw writeFailure('markAllRead', error)

    return data?.length ?? 0
  }
}

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.read_at ? new Date(row.read_at) : null,
    createdAt: new Date(row.created_at),
  }
}

function readFailure(context: string, error: { code?: string | null }): Error {
  console.error(`[notifications] ${context}`, { code: error.code ?? null })
  return new Error('Não foi possível carregar as notificações.')
}

function writeFailure(
  context: string,
  error: { code?: string | null },
): Error {
  console.error(`[notifications] ${context}`, { code: error.code ?? null })
  return new Error('Não foi possível atualizar a notificação.')
}
