import type { InboxConversationDto } from '../schemas/inbox.schema'

export interface InboxScreenProps {
  conversations: readonly InboxConversationDto[]
  isLive: boolean
}
