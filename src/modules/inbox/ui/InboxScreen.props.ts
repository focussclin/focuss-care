import type { ConversationStatus } from '@/lib/supabase/database.types'

import type {
  InboxAssigneeOptionDto,
  InboxConversationDto,
} from '../schemas/inbox.schema'

export interface InboxScreenProps {
  conversations: readonly InboxConversationDto[]
  /** Membros da clínica que podem ficar como responsáveis. Composto na rota. */
  assignees: readonly InboxAssigneeOptionDto[]
  onChangeStatus: (
    conversationId: string,
    status: ConversationStatus,
  ) => Promise<string | null>
  onAssign: (
    conversationId: string,
    assigneeId: string | null,
  ) => Promise<string | null>
  onMarkRead: (conversationId: string) => Promise<string | null>
  isLive: boolean
  /** Falha de leitura: a tela mostra o erro em vez de fingir inbox vazia. */
  loadError?: string | null
}
