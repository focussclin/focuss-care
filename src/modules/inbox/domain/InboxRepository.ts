import type { InboxConversation, InboxMessage } from './Inbox'

export interface InboxRepository {
  listConversations(clinicId: string): Promise<InboxConversation[]>
  listMessages(
    clinicId: string,
    conversationIds: readonly string[],
  ): Promise<InboxMessage[]>
}
