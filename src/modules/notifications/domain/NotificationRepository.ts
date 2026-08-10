import type { Notification } from './Notification'
import type { NotificationPreferences } from '@/lib/notifications/preferences'

export interface CreateNotificationInput {
  kind: string
  title: string
  body?: string | null
  link?: string | null
}

export interface NotificationRepository {
  getPreferences(clinicId: string): Promise<NotificationPreferences>

  createForUser(
    clinicId: string,
    userId: string,
    input: CreateNotificationInput,
  ): Promise<Notification>

  listForUser(
    clinicId: string,
    userId: string,
    limit: number,
  ): Promise<Notification[]>

  countUnread(clinicId: string, userId: string): Promise<number>

  markRead(
    clinicId: string,
    userId: string,
    notificationId: string,
  ): Promise<Notification | null>

  /** Marca em lote somente os avisos ainda não lidos deste usuário. */
  markAllRead(clinicId: string, userId: string): Promise<number>
}
