'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toInboxFailure } from '../application/inboxFailure'
import { canChangeStatus } from '../domain/Inbox'
import { toInboxConversationDto } from '../application/toInboxDto'
import { inboxRepositoryFor } from '../infrastructure/repository'
import {
  inboxMessages,
  setConversationStatusSchema,
  type InboxConversationDto,
  type SetConversationStatusInput,
} from '../schemas/inbox.schema'

type Fields = 'conversationId' | 'status'

const runSetConversationStatus = createAction<
  SetConversationStatusInput,
  InboxConversationDto,
  Fields
>({
  name: 'conversation.status',
  schema: setConversationStatusSchema,
  roles: rolesWith('encounter.write'),
  messages: {
    validation: inboxMessages.invalidFields,
    unavailable: inboxMessages.unavailable,
    unexpected: inboxMessages.unexpected,
  },
  revalidatePaths: ['/inbox'],
  handler: async (input, context) => {
    try {
      const repository = inboxRepositoryFor(context.supabase)

      /*
       * A regra de domínio decide AQUI, e não só na tela.
       *
       * `canChangeStatus` era aplicada apenas no clique. Quem chama a action
       * direto — ou uma aba aberta há meia hora, com a lista defasada — passava
       * por fora: o UPDATE gravava o mesmo valor, mexia `updated_at` e a
       * conversa pulava para o topo da lista sem que nada tivesse acontecido.
       *
       * A leitura extra é o preço de a origem vir do banco em vez do cliente.
       *
       * Ela NÃO fecha a janela de concorrência, e não é para isso que serve:
       * entre este `findStatus` e a gravação cabe outra pessoa resolvendo a
       * mesma conversa. Quem fecha é o `from` que desce junto — vira condição
       * no `WHERE` do UPDATE, e a escrita só acontece se a conversa ainda
       * estiver onde este código a viu.
       */
      const current = await repository.findStatus(context.clinicId, input.conversationId)
      if (current === null) {
        return err<Fields>('not-found', inboxMessages.notFound)
      }
      if (!canChangeStatus(current, input.status)) {
        return err<Fields>('validation', inboxMessages.statusUnchanged)
      }

      const conversation = await repository.setStatus(
        context.clinicId,
        input.conversationId,
        current,
        input.status,
      )
      // A tela recarrega pela revalidação; o DTO volta para a auditoria saber o
      // que ficou gravado, e não o que foi pedido.
      return ok(toInboxConversationDto(conversation, []))
    } catch (cause) {
      return toInboxFailure<Fields>('conversation.status', cause)
    }
  },
  audit: (output) => ({
    action: 'conversation.status_changed',
    entityType: 'conversation',
    entityId: output.id,
    after: { status: output.status },
  }),
})

export async function setConversationStatusAction(
  rawInput: unknown,
): Promise<ActionResult<InboxConversationDto, Fields>> {
  return runSetConversationStatus(rawInput)
}
