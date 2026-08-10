'use server'

import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { notificationRepositoryFor } from '../infrastructure/repository'
import {
  markAllNotificationsReadSchema,
  type MarkAllNotificationsReadInput,
} from '../schemas/notification.schema'

const runMarkAllNotificationsRead = createAction<
  MarkAllNotificationsReadInput,
  number,
  never
>({
  name: 'notification.read-all',
  schema: markAllNotificationsReadSchema,
  messages: {
    validation: 'A solicitação de notificações não é válida.',
    unavailable: 'As notificações estão indisponíveis agora.',
    unexpected: 'Não foi possível atualizar as notificações agora.',
  },
  revalidatePaths: [],
  handler: async (_input, context) => {
    const count = await notificationRepositoryFor(context.supabase).markAllRead(
      context.clinicId,
      context.userId,
    )

    return ok(count)
  },
  audit: (count) =>
    count > 0
      ? {
          action: 'notification.read-all',
          entityType: 'notification',
          after: { count },
        }
      : null,
})

export async function markAllNotificationsReadAction(
  rawInput: unknown,
): Promise<ActionResult<number, never>> {
  return runMarkAllNotificationsRead(rawInput)
}
