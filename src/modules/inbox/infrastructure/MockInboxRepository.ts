import type { InboxConversation, InboxMessage } from '../domain/Inbox'
import type { InboxRepository } from '../domain/InboxRepository'
import { InboxRepositoryError } from '../domain/InboxRepositoryError'

/** Sem conversas fictícias: a Inbox demo começa vazia. */
export class MockInboxRepository implements InboxRepository {
  async listConversations(): Promise<InboxConversation[]> {
    return []
  }

  async listMessages(): Promise<InboxMessage[]> {
    return []
  }

  async findStatus(): Promise<null> {
    // A inbox demo comeca vazia: nenhuma conversa existe para ter status.
    return null
  }

  async setStatus(): Promise<InboxConversation> {
    throw readOnly()
  }

  async setAssignee(): Promise<InboxConversation> {
    throw readOnly()
  }

  async markRead(): Promise<InboxConversation> {
    throw readOnly()
  }
}

function readOnly(): InboxRepositoryError {
  return new InboxRepositoryError('unavailable', 'demo repository is read-only')
}
