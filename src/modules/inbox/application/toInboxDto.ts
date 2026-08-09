import type { InboxConversation, InboxMessage } from '../domain/Inbox'
import type { InboxConversationDto, InboxMessageDto } from '../schemas/inbox.schema'

export function toInboxMessageDto(message: InboxMessage): InboxMessageDto {
  return {
    id: message.id,
    conversationId: message.conversationId,
    direction: message.direction,
    contentType: message.contentType,
    body: message.body,
    mediaUrl: message.mediaUrl,
    status: message.status,
    isFromAi: message.isFromAi,
    sentAt: message.sentAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  }
}

export function toInboxConversationDto(
  conversation: InboxConversation,
  messages: readonly InboxMessage[] = conversation.messages,
): InboxConversationDto {
  return {
    id: conversation.id,
    contactName: conversation.contactName,
    contactPhone: conversation.contactPhone,
    status: conversation.status,
    assignedTo: conversation.assignedTo,
    isAiHandled: conversation.isAiHandled,
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    unreadCount: conversation.unreadCount,
    patientId: conversation.patientId,
    patientName: conversation.patientName,
    messages: messages.map(toInboxMessageDto),
  }
}
