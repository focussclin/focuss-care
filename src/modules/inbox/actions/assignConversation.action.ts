'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toInboxFailure } from '../application/inboxFailure'
import { toInboxConversationDto } from '../application/toInboxDto'
import { inboxRepositoryFor } from '../infrastructure/repository'
import {
  assignConversationSchema,
  inboxMessages,
  type AssignConversationInput,
  type InboxConversationDto,
} from '../schemas/inbox.schema'

type Fields = 'conversationId' | 'assigneeId'

/**
 * Define ou remove o responsável pela conversa.
 *
 * Quem pode ser responsável é decidido pela FK de `assigned_to` e pela policy —
 * não por uma lista validada aqui. A tela oferece os membros da clínica porque
 * é o que faz sentido oferecer, mas se alguém mandar outro id o banco recusa, e
 * é ele que tem a palavra final.
 */
const runAssignConversation = createAction<
  AssignConversationInput,
  InboxConversationDto,
  Fields
>({
  name: 'conversation.assign',
  schema: assignConversationSchema,
  roles: rolesWith('encounter.write'),
  messages: {
    validation: inboxMessages.invalidFields,
    unavailable: inboxMessages.unavailable,
    unexpected: inboxMessages.unexpected,
  },
  revalidatePaths: ['/inbox'],
  handler: async (input, context) => {
    try {
      const conversation = await inboxRepositoryFor(context.supabase).setAssignee(
        context.clinicId,
        input.conversationId,
        input.assigneeId,
      )
      return ok(toInboxConversationDto(conversation, []))
    } catch (cause) {
      return toInboxFailure<Fields>('conversation.assign', cause)
    }
  },
  audit: (output) => ({
    action: output.assignedTo ? 'conversation.assigned' : 'conversation.unassigned',
    entityType: 'conversation',
    entityId: output.id,
    after: { assigned_to: output.assignedTo?.id ?? null },
  }),
})

export async function assignConversationAction(
  rawInput: unknown,
): Promise<ActionResult<InboxConversationDto, Fields>> {
  return runAssignConversation(rawInput)
}
