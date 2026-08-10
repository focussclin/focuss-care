import type {
  ConversationStatus,
  MessageDirection,
  MessageStatus,
} from '@/lib/supabase/database.types'

export interface InboxAssignee {
  id: string
  name: string
}

/**
 * O que a Inbox sabe mexer, e o que ela deliberadamente não sabe.
 *
 * `conversations` tem `status`, `assigned_to` e `unread_count` — e mais nada que
 * a equipe controle. **Não existe coluna de prioridade nem de notas internas.**
 * Um seletor de prioridade aqui não teria onde gravar, e uma caixa de notas
 * perderia o texto no primeiro recarregamento; por isso nenhum dos dois foi
 * feito, e não por esquecimento.
 *
 * Envio de mensagem também fica de fora: depende do provedor externo e da
 * ingestão de eventos, que não existem.
 */
export const CONVERSATION_STATUSES = [
  'open',
  'pending',
  'resolved',
  'archived',
] as const

/** Trocar um status por ele mesmo é um clique que não faz nada. */
export function canChangeStatus(
  from: ConversationStatus,
  to: ConversationStatus,
): boolean {
  return from !== to
}

/**
 * Ler a conversa zera o contador — mas só quando há o que zerar.
 *
 * Sem esta checagem, abrir uma conversa já lida dispararia um UPDATE por
 * clique: escrita inútil no banco, linha de auditoria inútil e `updated_at`
 * mexido, o que reordena a lista sem que nada tenha acontecido.
 */
export function needsReadReset(unreadCount: number): boolean {
  return unreadCount > 0
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
