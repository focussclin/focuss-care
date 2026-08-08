import { z } from 'zod'

export const markNotificationReadSchema = z.object({
  notificationId: z.uuid(),
})

export type MarkNotificationReadInput = z.infer<
  typeof markNotificationReadSchema
>

export const markAllNotificationsReadSchema = z.object({})
export type MarkAllNotificationsReadInput = z.infer<
  typeof markAllNotificationsReadSchema
>

export interface NotificationDto {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}
