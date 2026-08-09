// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { InboxConversationDto } from '../schemas/inbox.schema'
import { InboxScreen } from './InboxScreen'

const conversation: InboxConversationDto = {
  id: 'conversation-1',
  contactName: 'Maria Silva',
  contactPhone: '5511999990000',
  status: 'open',
  assignedTo: { id: 'user-1', name: 'Ana Costa' },
  isAiHandled: false,
  lastMessageAt: '2026-08-09T10:00:00.000Z',
  unreadCount: 2,
  patientId: 'patient-1',
  patientName: 'Maria Silva',
  messages: [
    {
      id: 'message-1',
      conversationId: 'conversation-1',
      direction: 'inbound',
      contentType: 'text',
      body: 'Gostaria de confirmar meu horário.',
      mediaUrl: null,
      status: 'read',
      isFromAi: false,
      sentAt: '2026-08-09T10:00:00.000Z',
      createdAt: '2026-08-09T10:00:00.000Z',
    },
  ],
}

afterEach(cleanup)

describe('InboxScreen', () => {
  it('mostra a conversa, contagem de não lidas e detalhe da mensagem', () => {
    render(<InboxScreen conversations={[conversation]} isLive />)

    expect(screen.getAllByText('Maria Silva')).toHaveLength(2)
    expect(screen.getAllByText('Gostaria de confirmar meu horário.')).toHaveLength(2)
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByRole('link', { name: /abrir ficha/i })).toBeTruthy()
  })

  it('filtra conversas por status e busca', () => {
    render(<InboxScreen conversations={[conversation]} isLive />)

    fireEvent.change(screen.getByLabelText('Buscar conversa'), {
      target: { value: 'não existe' },
    })
    expect(screen.getByText('Nenhuma conversa encontrada.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Buscar conversa'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'resolved' } })
    expect(screen.getByText('Nenhuma conversa encontrada.')).toBeTruthy()
  })

  it('declara o modo demo e não fabrica conversas', () => {
    render(<InboxScreen conversations={[]} isLive={false} />)

    expect(screen.getByText(/modo demonstração/i)).toBeTruthy()
    expect(screen.getByText('Ainda não há conversas.')).toBeTruthy()
  })
})
