import type { InboxConversation, InboxMessage } from '../domain/Inbox'
import type { InboxRepository } from '../domain/InboxRepository'

/** Sem conversas fictícias: a Inbox demo começa vazia. */
export class MockInboxRepository implements InboxRepository {
  async listConversations(): Promise<InboxConversation[]> {
    return []
  }

  async listMessages(): Promise<InboxMessage[]> {
    return []
  }
}
