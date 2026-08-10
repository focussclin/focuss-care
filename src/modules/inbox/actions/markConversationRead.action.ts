'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toInboxFailure } from '../application/inboxFailure'
import { toInboxConversationDto } from '../application/toInboxDto'
import { inboxRepositoryFor } from '../infrastructure/repository'
import {
  inboxMessages,
  markConversationReadSchema,
  type InboxConversationDto,
  type MarkConversationReadInput,
} from '../schemas/inbox.schema'

type Fields = 'conversationId'

/**
 * Zera `unread_count` ao abrir a conversa.
 *
 * Não audita. A auditoria registra o que muda a operação da clínica, e "fulano
 * abriu a conversa" a cada clique afogaria a trilha em ruído — quem leu o quê
 * é telemetria de uso, não decisão. Status e responsável, esses sim, mudam de
 * quem é a responsabilidade pelo atendimento, e são auditados.
 */
const runMarkConversationRead = createAction<
  MarkConversationReadInput,
  InboxConversationDto,
  Fields
>({
  name: 'conversation.read',
  schema: markConversationReadSchema,
  roles: rolesWith('encounter.write'),
  messages: {
    validation: inboxMessages.invalidFields,
    unavailable: inboxMessages.unavailable,
    unexpected: inboxMessages.unexpected,
  },
  revalidatePaths: ['/inbox'],
  handler: async (input, context) => {
    try {
      const conversation = await inboxRepositoryFor(context.supabase).markRead(
        context.clinicId,
        input.conversationId,
      )
      return ok(toInboxConversationDto(conversation, []))
    } catch (cause) {
      return toInboxFailure<Fields>('conversation.read', cause)
    }
  },
})

export async function markConversationReadAction(
  rawInput: unknown,
): Promise<ActionResult<InboxConversationDto, Fields>> {
  return runMarkConversationRead(rawInput)
}
