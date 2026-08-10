import type { ConversationStatus } from '@/lib/supabase/database.types'

import type { InboxConversation, InboxMessage } from './Inbox'

export interface InboxRepository {
  listConversations(clinicId: string): Promise<InboxConversation[]>
  listMessages(
    clinicId: string,
    conversationIds: readonly string[],
  ): Promise<InboxMessage[]>
  /**
   * Status atual da conversa, ou `null` se ela nao existe nesta clinica.
   *
   * Existe para a action decidir ANTES de escrever. `canChangeStatus` precisa
   * do estado de origem, e o cliente nao e fonte confiavel dele: quem chama a
   * action direto nao passa por tela nenhuma.
   */
  findStatus(
    clinicId: string,
    conversationId: string,
  ): Promise<ConversationStatus | null>
  /**
   * Compare-and-swap: so grava se a conversa ainda estiver em `from`.
   *
   * `from` nao e redundante com a leitura que a action faz antes. Aquela
   * leitura decide se a troca FAZ SENTIDO (`canChangeStatus`); esta condicao
   * decide se ela ainda e VALIDA no instante da escrita. Entre uma e outra
   * cabe outra pessoa resolvendo a mesma conversa, e sem a condicao no `WHERE`
   * a segunda gravacao apagaria a primeira sem ninguem notar.
   *
   * Zero linhas afetadas nao e um caso so, e por isso o adapter relê o status:
   * a conversa pode ter sumido, ter mudado de estado, ou a policy de escrita
   * pode nao existir. As tres pedem mensagens diferentes.
   */
  setStatus(
    clinicId: string,
    conversationId: string,
    from: ConversationStatus,
    to: ConversationStatus,
  ): Promise<InboxConversation>
  /**
   * `assigneeId` nulo devolve a conversa para a fila sem dono.
   *
   * O id é de `profiles`, e não de `memberships` — é o que `assigned_to`
   * referencia. Quem valida se a pessoa pertence à clínica é a policy da
   * própria coluna, não esta camada.
   */
  setAssignee(
    clinicId: string,
    conversationId: string,
    assigneeId: string | null,
  ): Promise<InboxConversation>
  markRead(clinicId: string, conversationId: string): Promise<InboxConversation>
}
