'use server'

import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toNotificationDto } from '../application/toNotificationDto'
import { notificationRepositoryFor } from '../infrastructure/repository'
import {
  markNotificationReadSchema,
  type MarkNotificationReadInput,
  type NotificationDto,
} from '../schemas/notification.schema'

const runMarkNotificationRead = createAction<
  MarkNotificationReadInput,
  NotificationDto | null,
  never
>({
  name: 'notification.read',
  schema: markNotificationReadSchema,
  messages: {
    validation: 'Esta notificação não é válida.',
    unavailable: 'As notificações estão indisponíveis agora.',
    unexpected: 'Não foi possível atualizar a notificação agora.',
  },
  revalidatePaths: [],

  handler: async (input, context) => {
    const notification = await notificationRepositoryFor(
      context.supabase,
    ).markRead(context.clinicId, context.userId, input.notificationId)

    return ok<NotificationDto | null>(
      notification ? toNotificationDto(notification) : null,
    )
  },

  audit: (output) =>
    output
      ? {
          action: 'notification.read',
          entityType: 'notification',
          entityId: output.id,
        }
      : null,
})

export async function markNotificationReadAction(
  rawInput: unknown,
): Promise<ActionResult<NotificationDto | null, never>> {
  return runMarkNotificationRead(rawInput)
}
