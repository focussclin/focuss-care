import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  ConversationRow,
  ConversationStatus,
  Database,
  MessageRow,
} from '@/lib/supabase/database.types'

import type { InboxConversation, InboxMessage } from '../domain/Inbox'
import type { InboxRepository } from '../domain/InboxRepository'
import { InboxRepositoryError } from '../domain/InboxRepositoryError'

type Client = SupabaseClient<Database>

const CONVERSATION_CAP = 100
const MESSAGE_CAP = 500

const CONVERSATION_SELECT = `
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
      `

/** O UPDATE alcanca so o que a equipe controla. */
interface ConversationPatch {
  status?: ConversationStatus
  assigned_to?: string | null
  unread_count?: number
}

interface ConversationJoinRow extends ConversationRow {
  patient: { id: string; full_name: string } | null
  assigned: { id: string; full_name: string } | null
}

export class SupabaseInboxRepository implements InboxRepository {
  constructor(private readonly client: Client) {}

  async listConversations(clinicId: string): Promise<InboxConversation[]> {
    const { data, error } = await this.client
      .from('conversations')
      .select(CONVERSATION_SELECT)
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

    /*
     * A ordem é DESCENDENTE por causa do teto, e não por gosto.
     *
     * A consulta busca as mensagens de até `CONVERSATION_CAP` conversas de uma
     * vez, com um teto único de `MESSAGE_CAP` linhas. Com `ascending: true` o
     * teto guardava as mensagens MAIS ANTIGAS da clínica inteira: bastavam
     * algumas conversas longas para consumir as 500 linhas, e as conversas
     * recentes — as do topo da lista, as que têm não lidas — chegavam à tela
     * com zero mensagens. O painel dizia "3 não lidas" ao lado de "nenhuma
     * mensagem persistida".
     *
     * Descendente, o que o teto descarta é o passado distante, que é o que se
     * pode perder numa conversa. A ordem de exibição é restaurada em
     * `groupMessagesByConversation`.
     */
    const { data, error } = await this.client
      .from('messages')
      .select(
        'id, clinic_id, conversation_id, direction, content_type, body, media_url, provider_message_id, status, sent_by, is_from_ai, error, sent_at, delivered_at, read_at, created_at',
      )
      .eq('clinic_id', clinicId)
      .in('conversation_id', [...conversationIds])
      .order('created_at', { ascending: false })
      .limit(MESSAGE_CAP)

    if (error) throw toInboxError(error)
    return (data ?? []).map((row) => toMessage(row as MessageRow))
  }

  async findStatus(
    clinicId: string,
    conversationId: string,
  ): Promise<ConversationStatus | null> {
    const { data, error } = await this.client
      .from('conversations')
      .select('status')
      .eq('clinic_id', clinicId)
      .eq('id', conversationId)
      .maybeSingle()

    if (error) throw toInboxError(error)
    return (data as { status: ConversationStatus } | null)?.status ?? null
  }

  /**
   * Compare-and-swap no `WHERE`, e um diagnóstico de três saídas.
   *
   * `.eq('status', from)` é a condição inteira: se outra pessoa resolveu a
   * conversa entre a leitura da action e esta escrita, o UPDATE não encontra
   * linha e nada é sobrescrito. Sem ela, a segunda gravação apagaria a primeira
   * em silêncio — as duas telas mostrariam sucesso e o banco guardaria só a
   * última.
   *
   * Zero linhas afetadas tem três causas diferentes, e é por isso que a
   * releitura traz o `status` e não só o `id`:
   *
   *   linha ausente          -> `not-found`, a conversa saiu desta clínica
   *   status diferente        -> `stale`, alguém chegou primeiro
   *   status IGUAL a `from`   -> `write-forbidden`, faltou policy de UPDATE
   *
   * O terceiro caso é o que separa este método de um CAS ingênuo: a condição
   * batia, então quem recusou foi o banco, e não a concorrência.
   */
  async setStatus(
    clinicId: string,
    conversationId: string,
    from: ConversationStatus,
    to: ConversationStatus,
  ): Promise<InboxConversation> {
    const { data, error } = await this.client
      .from('conversations')
      .update({ status: to, updated_at: new Date().toISOString() })
      .eq('clinic_id', clinicId)
      .eq('id', conversationId)
      .eq('status', from)
      .select(CONVERSATION_SELECT)
      .maybeSingle()

    if (error) throw toInboxError(error)
    if (data) return toConversation(data as unknown as ConversationJoinRow)

    const current = await this.findStatus(clinicId, conversationId)

    if (current === null) {
      throw new InboxRepositoryError('not-found', 'conversa indisponível nesta clínica')
    }
    if (current !== from) {
      throw new InboxRepositoryError(
        'stale',
        `a conversa saiu de ${from} para ${current} antes da gravação`,
      )
    }
    throw new InboxRepositoryError(
      'write-forbidden',
      'a conversa é legível mas a escrita foi recusada',
    )
  }

  async setAssignee(
    clinicId: string,
    conversationId: string,
    assigneeId: string | null,
  ): Promise<InboxConversation> {
    return this.patch(clinicId, conversationId, { assigned_to: assigneeId })
  }

  async markRead(clinicId: string, conversationId: string): Promise<InboxConversation> {
    return this.patch(clinicId, conversationId, { unread_count: 0 })
  }

  /**
   * UPDATE que sabe a diferença entre "sumiu" e "a policy recusou".
   *
   * `conversations` já existe no banco aplicado, e a RLS está ativa — mas a
   * verificação registrada em `docs/03-banco-de-dados.md` cobriu leitura
   * anônima, não escrita autenticada. Se não houver policy de UPDATE para o
   * papel, o Postgres **não devolve erro**: a linha simplesmente não é
   * alcançada e zero linhas mudam.
   *
   * Sem a releitura abaixo, isso viraria "este registro não está mais
   * disponível" — a tela mandando procurar uma conversa que está ali na lista,
   * enquanto a causa real é permissão. A releitura usa o SELECT, que é
   * comprovadamente permitido: se a linha aparece, quem recusou foi a escrita.
   */
  private async patch(
    clinicId: string,
    conversationId: string,
    patch: ConversationPatch,
  ): Promise<InboxConversation> {
    const { data, error } = await this.client
      .from('conversations')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('clinic_id', clinicId)
      .eq('id', conversationId)
      .select(CONVERSATION_SELECT)
      .maybeSingle()

    if (error) throw toInboxError(error)
    if (data) return toConversation(data as unknown as ConversationJoinRow)

    const { data: existing, error: readError } = await this.client
      .from('conversations')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('id', conversationId)
      .maybeSingle()

    if (readError) throw toInboxError(readError)
    if (existing) {
      throw new InboxRepositoryError(
        'write-forbidden',
        'a conversa é legível mas a escrita foi recusada',
      )
    }
    throw new InboxRepositoryError('not-found', 'conversa indisponível nesta clínica')
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
