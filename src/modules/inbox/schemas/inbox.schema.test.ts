import { describe, expect, it } from 'vitest'

import { CONVERSATION_STATUSES, canChangeStatus, needsReadReset } from '../domain/Inbox'
import {
  assignConversationSchema,
  conversationStatusOptions,
  setConversationStatusSchema,
} from './inbox.schema'

const CONVERSATION = '11111111-1111-4111-8111-111111111111'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'

describe('setConversationStatusSchema', () => {
  it('aceita os quatro status do enum do banco', () => {
    for (const status of CONVERSATION_STATUSES) {
      expect(
        setConversationStatusSchema.safeParse({ conversationId: CONVERSATION, status }).success,
        status,
      ).toBe(true)
    }
  })

  it('recusa status inventado', () => {
    /*
     * `conversations.status` é um enum do Postgres. Um valor fora dele viraria
     * `22P02` na cara do usuário, com mensagem de driver.
     */
    expect(
      setConversationStatusSchema.safeParse({ conversationId: CONVERSATION, status: 'urgente' }).success,
    ).toBe(false)
  })

  it('não carrega prioridade nem notas — não existem colunas para isso', () => {
    /*
     * `conversations` tem `status`, `assigned_to` e `unread_count`, e nada mais
     * que a equipe controle. Um campo de prioridade aqui não teria onde gravar.
     */
    const parsed = setConversationStatusSchema.parse({
      conversationId: CONVERSATION,
      status: 'open',
      priority: 'high',
      notes: 'urgente',
    })

    expect(Object.keys(parsed).sort()).toEqual(['conversationId', 'status'])
  })
})

describe('assignConversationSchema', () => {
  it('string vazia vira null — devolver para a fila é operação legítima', () => {
    const parsed = assignConversationSchema.parse({ conversationId: CONVERSATION, assigneeId: '' })

    expect(parsed.assigneeId).toBeNull()
  })

  it('aceita null explícito', () => {
    const parsed = assignConversationSchema.parse({ conversationId: CONVERSATION, assigneeId: null })

    expect(parsed.assigneeId).toBeNull()
  })

  it('aceita o id do perfil', () => {
    const parsed = assignConversationSchema.parse({ conversationId: CONVERSATION, assigneeId: USER })

    expect(parsed.assigneeId).toBe(USER)
  })

  it('recusa id que não é uuid', () => {
    expect(
      assignConversationSchema.safeParse({ conversationId: CONVERSATION, assigneeId: 'ana' }).success,
    ).toBe(false)
  })
})

describe('as opções da tela cobrem o enum inteiro', () => {
  it('nenhum status fica sem rótulo', () => {
    // Um status sem opção sumiria do filtro e do seletor — a conversa existiria
    // num estado que a tela não sabe nomear nem escolher.
    expect(conversationStatusOptions.map((option) => option.value).sort()).toEqual(
      [...CONVERSATION_STATUSES].sort(),
    )
  })
})

describe('regras do domínio', () => {
  it('trocar um status por ele mesmo não é troca', () => {
    expect(canChangeStatus('open', 'open')).toBe(false)
    expect(canChangeStatus('open', 'resolved')).toBe(true)
  })

  it('só zera leitura quando há o que zerar', () => {
    expect(needsReadReset(0)).toBe(false)
    expect(needsReadReset(3)).toBe(true)
  })
})
