import { z } from 'zod'

export const markNotificationReadSchema = z.object({
  notificationId: z.uuid(),
})

export type MarkNotificationReadInput = z.infer<
  typeof markNotificationReadSchema
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
