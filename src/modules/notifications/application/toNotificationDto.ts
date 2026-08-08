import type { Notification } from '../domain/Notification'
import type { NotificationDto } from '../schemas/notification.schema'

export function toNotificationDto(notification: Notification): NotificationDto {
  return {
    id: notification.id,
    kind: notification.kind,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  }
}
