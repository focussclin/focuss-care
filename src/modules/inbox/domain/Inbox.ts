import type {
  ConversationStatus,
  MessageDirection,
  MessageStatus,
} from '@/lib/supabase/database.types'

export interface InboxAssignee {
  id: string
  name: string
}

export interface InboxMessage {
  id: string
  conversationId: string
  direction: MessageDirection
  contentType: string
  body: string | null
  mediaUrl: string | null
  status: MessageStatus
  isFromAi: boolean
  sentAt: Date | null
  createdAt: Date
}

export interface InboxConversation {
  id: string
  contactName: string
  contactPhone: string
  status: ConversationStatus
  assignedTo: InboxAssignee | null
  isAiHandled: boolean
  lastMessageAt: Date | null
  unreadCount: number
  patientId: string | null
  patientName: string | null
  messages: readonly InboxMessage[]
}
