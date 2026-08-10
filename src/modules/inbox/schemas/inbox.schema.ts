import type { ConversationStatus, MessageDirection, MessageStatus } from '@/lib/supabase/database.types'

export const conversationStatusOptions = [
  { value: 'open', label: 'Abertas' },
  { value: 'pending', label: 'Aguardando' },
  { value: 'resolved', label: 'Resolvidas' },
  { value: 'archived', label: 'Arquivadas' },
] as const satisfies readonly { value: ConversationStatus; label: string }[]

export interface InboxMessageDto {
  id: string
  conversationId: string
  direction: MessageDirection
  contentType: string
  body: string | null
  mediaUrl: string | null
  status: MessageStatus
  isFromAi: boolean
  sentAt: string | null
  createdAt: string
}

export interface InboxConversationDto {
  id: string
  contactName: string
  contactPhone: string
  status: ConversationStatus
  assignedTo: { id: string; name: string } | null
  isAiHandled: boolean
  lastMessageAt: string | null
  unreadCount: number
  patientId: string | null
  patientName: string | null
  messages: readonly InboxMessageDto[]
}
