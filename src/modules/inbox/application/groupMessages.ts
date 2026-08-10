import type { InboxMessage } from '../domain/Inbox'

/**
 * Agrupa por conversa e devolve cada thread em ordem cronológica.
 *
 * O repositório busca as mensagens em ordem DESCENDENTE de propósito: o teto de
 * linhas é único para todas as conversas do lote, e ordenar crescente fazia o
 * teto guardar as mensagens mais antigas da clínica inteira — as conversas
 * recentes chegavam vazias à tela. Aqui a ordem de leitura é restaurada, que é
 * a única que faz sentido para exibir.
 *
 * A rota fazia esse agrupamento à mão, sem inverter nada, e não tinha teste.
 */
export function groupMessagesByConversation(
  messages: readonly InboxMessage[],
): Map<string, InboxMessage[]> {
  const grouped = new Map<string, InboxMessage[]>()

  for (const message of messages) {
    const current = grouped.get(message.conversationId)
    if (current) current.push(message)
    else grouped.set(message.conversationId, [message])
  }

  for (const thread of grouped.values()) {
    thread.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
  }

  return grouped
}
