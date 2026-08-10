import { z } from 'zod'

import type { ConversationStatus, MessageDirection, MessageStatus } from '@/lib/supabase/database.types'

import { CONVERSATION_STATUSES } from '../domain/Inbox'

export const inboxMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  forbidden: 'Você não tem permissão para atender conversas nesta clínica.',
  /*
   * Distinta de `forbidden` de propósito: aqui a leitura funcionou e a escrita
   * não. O texto aponta para o banco porque é lá que está a causa — sem policy
   * de UPDATE em `conversations`, o Postgres recusa em silêncio.
   */
  writeForbidden:
    'A conversa foi carregada, mas o banco recusou a alteração. Falta policy de escrita em `conversations` para este papel.',
  notFound: 'Esta conversa não está mais disponível nesta clínica.',
  statusUnchanged: 'A conversa já está neste status.',
  /*
   * Concorrência, e não permissão nem sumiço. A saída é recarregar — por isso a
   * mensagem diz o que fazer em vez de só constatar o conflito.
   */
  stale:
    'Outra pessoa alterou esta conversa enquanto você trabalhava nela. Recarregue a lista para ver o estado atual.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a ação agora. Tente novamente.',
} as const

export const setConversationStatusSchema = z.object({
  conversationId: z.uuid(inboxMessages.notFound),
  status: z.enum(CONVERSATION_STATUSES, inboxMessages.invalidFields),
})
export type SetConversationStatusInput = z.infer<typeof setConversationStatusSchema>

/**
 * `assigneeId` aceita vazio, que vira `null` — devolver a conversa para a fila
 * sem dono é uma operação legítima, e não um campo esquecido.
 */
export const assignConversationSchema = z.object({
  conversationId: z.uuid(inboxMessages.notFound),
  assigneeId: z
    .union([z.literal(''), z.null(), z.uuid(inboxMessages.invalidFields)])
    .transform((value) => value || null),
})
export type AssignConversationInput = z.infer<typeof assignConversationSchema>

export const markConversationReadSchema = z.object({
  conversationId: z.uuid(inboxMessages.notFound),
})
export type MarkConversationReadInput = z.infer<typeof markConversationReadSchema>

export interface InboxAssigneeOptionDto {
  id: string
  name: string
}

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
