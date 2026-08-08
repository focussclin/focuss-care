import type { Notification } from './Notification'

export interface NotificationRepository {
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
