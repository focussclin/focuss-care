import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, ConversationRow, MessageRow } from '@/lib/supabase/database.types'

import type { InboxConversation, InboxMessage } from '../domain/Inbox'
import type { InboxRepository } from '../domain/InboxRepository'
import { InboxRepositoryError } from '../domain/InboxRepositoryError'

type Client = SupabaseClient<Database>

const CONVERSATION_CAP = 100
const MESSAGE_CAP = 500

interface ConversationJoinRow extends ConversationRow {
  patient: { id: string; full_name: string } | null
  assigned: { id: string; full_name: string } | null
}

export class SupabaseInboxRepository implements InboxRepository {
  constructor(private readonly client: Client) {}

  async listConversations(clinicId: string): Promise<InboxConversation[]> {
    const { data, error } = await this.client
      .from('conversations')
      .select(`
        id,
        clinic_id,
        channel_id,
        patient_id,
        contact_phone,
        contact_name,
        status,
        assigned_to,
        is_ai_handled,
        last_message_at,
        unread_count,
        created_at,
        updated_at,
        patient:patients ( id, full_name ),
        assigned:profiles ( id, full_name )
      `)
      .eq('clinic_id', clinicId)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .limit(CONVERSATION_CAP)

    if (error) throw toInboxError(error)
    return (data ?? []).map((row) => toConversation(row as unknown as ConversationJoinRow))
  }

  async listMessages(
    clinicId: string,
    conversationIds: readonly string[],
  ): Promise<InboxMessage[]> {
    if (conversationIds.length === 0) return []

    const { data, error } = await this.client
      .from('messages')
      .select(
        'id, clinic_id, conversation_id, direction, content_type, body, media_url, provider_message_id, status, sent_by, is_from_ai, error, sent_at, delivered_at, read_at, created_at',
      )
      .eq('clinic_id', clinicId)
      .in('conversation_id', [...conversationIds])
      .order('created_at', { ascending: true })
      .limit(MESSAGE_CAP)

    if (error) throw toInboxError(error)
    return (data ?? []).map((row) => toMessage(row as MessageRow))
  }
}

function toConversation(row: ConversationJoinRow): InboxConversation {
  return {
    id: row.id,
    contactName: row.contact_name?.trim() || row.contact_phone,
    contactPhone: row.contact_phone,
    status: row.status,
    assignedTo: row.assigned
      ? { id: row.assigned.id, name: row.assigned.full_name }
      : null,
    isAiHandled: row.is_ai_handled,
    lastMessageAt: row.last_message_at ? new Date(row.last_message_at) : null,
    unreadCount: row.unread_count,
    patientId: row.patient_id,
    patientName: row.patient?.full_name ?? null,
    messages: [],
  }
}

function toMessage(row: MessageRow): InboxMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    direction: row.direction,
    contentType: row.content_type,
    body: row.body,
    mediaUrl: row.media_url,
    status: row.status,
    isFromAi: row.is_from_ai,
    sentAt: row.sent_at ? new Date(row.sent_at) : null,
    createdAt: new Date(row.created_at),
  }
}

function toInboxError(error: { code?: string | null; message?: string | null }): InboxRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? ''
  if (code === '42501' || code === 'PGRST301') {
    return new InboxRepositoryError('forbidden', 'leitura recusada pela policy', code)
  }
  if (/fetch|network|timeout|econnrefused/i.test(message)) {
    return new InboxRepositoryError('unavailable', 'falha de conexão', code)
  }
  return new InboxRepositoryError('unexpected', 'falha ao carregar inbox', code)
}
