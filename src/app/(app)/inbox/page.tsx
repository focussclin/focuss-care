import type { Metadata } from 'next'
import { connection } from 'next/server'

import { toInboxConversationDto } from '@/modules/inbox/application/toInboxDto'
import { getInboxRepository } from '@/modules/inbox/infrastructure/repository'
import { InboxScreen } from '@/modules/inbox/ui/InboxScreen'

export const metadata: Metadata = {
  title: 'Inbox de atendimento',
  description: 'Conversas da clínica organizadas para a equipe.',
}

export default async function InboxPage() {
  await connection()

  const source = await getInboxRepository()
  const conversations = await source.repository.listConversations(source.clinicId)
  const messages = await source.repository.listMessages(
    source.clinicId,
    conversations.map((conversation) => conversation.id),
  )
  const messagesByConversation = new Map<string, typeof messages>()

  for (const message of messages) {
    const current = messagesByConversation.get(message.conversationId) ?? []
    current.push(message)
    messagesByConversation.set(message.conversationId, current)
  }

  return (
    <InboxScreen
      conversations={conversations.map((conversation) =>
        toInboxConversationDto(
          conversation,
          messagesByConversation.get(conversation.id) ?? [],
        ),
      )}
      isLive={source.isLive}
    />
  )
}
