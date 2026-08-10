import { describe, expect, it } from 'vitest'

import type { InboxMessage } from '../domain/Inbox'
import { groupMessagesByConversation } from './groupMessages'

/**
 * O repositório entrega as mensagens em ordem DESCENDENTE de propósito — o teto
 * de linhas é único para o lote inteiro, e ordenar crescente fazia as conversas
 * recentes chegarem vazias à tela. Restaurar a ordem de leitura é trabalho
 * daqui, e a rota fazia esse agrupamento à mão, sem inverter nada e sem teste.
 */

function message(id: string, conversationId: string, isoDate: string): InboxMessage {
  return {
    id,
    conversationId,
    direction: 'inbound',
    contentType: 'text',
    body: id,
    mediaUrl: null,
    status: 'read',
    isFromAi: false,
    sentAt: new Date(isoDate),
    createdAt: new Date(isoDate),
  }
}

describe('agrupamento de mensagens', () => {
  it('devolve cada thread em ordem cronológica, mesmo recebendo ao contrário', () => {
    const grouped = groupMessagesByConversation([
      message('c', 'conv-1', '2026-08-09T12:00:00.000Z'),
      message('b', 'conv-1', '2026-08-09T11:00:00.000Z'),
      message('a', 'conv-1', '2026-08-09T10:00:00.000Z'),
    ])

    expect(grouped.get('conv-1')?.map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('separa por conversa sem misturar', () => {
    const grouped = groupMessagesByConversation([
      message('a1', 'conv-1', '2026-08-09T10:00:00.000Z'),
      message('b1', 'conv-2', '2026-08-09T09:00:00.000Z'),
      message('a2', 'conv-1', '2026-08-09T11:00:00.000Z'),
    ])

    expect(grouped.get('conv-1')?.map((item) => item.id)).toEqual(['a1', 'a2'])
    expect(grouped.get('conv-2')?.map((item) => item.id)).toEqual(['b1'])
  })

  it('conversa sem mensagem simplesmente não aparece no mapa', () => {
    // A tela usa `?? []`; devolver uma entrada vazia aqui só criaria duas
    // formas de dizer a mesma coisa.
    const grouped = groupMessagesByConversation([])

    expect(grouped.size).toBe(0)
    expect(grouped.get('conv-1')).toBeUndefined()
  })

  it('a última mensagem do grupo é a mais recente — o que a lista usa de prévia', () => {
    const grouped = groupMessagesByConversation([
      message('nova', 'conv-1', '2026-08-09T12:00:00.000Z'),
      message('velha', 'conv-1', '2026-08-01T08:00:00.000Z'),
    ])

    expect(grouped.get('conv-1')?.at(-1)?.id).toBe('nova')
  })
})
