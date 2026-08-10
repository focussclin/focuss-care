// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { InboxConversationDto } from '../schemas/inbox.schema'
import { InboxScreen } from './InboxScreen'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const assignees = [
  { id: 'user-1', name: 'Ana Costa' },
  { id: 'user-2', name: 'Bruno Lima' },
]

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

function renderScreen(overrides: Partial<React.ComponentProps<typeof InboxScreen>> = {}) {
  return render(
    <InboxScreen
      conversations={[conversation]}
      assignees={assignees}
      onChangeStatus={vi.fn().mockResolvedValue(null)}
      onAssign={vi.fn().mockResolvedValue(null)}
      onMarkRead={vi.fn().mockResolvedValue(null)}
      isLive
      {...overrides}
    />,
  )
}

describe('InboxScreen', () => {
  it('mostra a conversa, contagem de não lidas e detalhe da mensagem', () => {
    renderScreen()

    expect(screen.getAllByText('Maria Silva')).toHaveLength(2)
    expect(screen.getAllByText('Gostaria de confirmar meu horário.')).toHaveLength(2)
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByRole('link', { name: /abrir ficha/i })).toBeTruthy()
  })

  it('filtra conversas por status e busca', () => {
    renderScreen()

    fireEvent.change(screen.getByLabelText('Buscar conversa'), {
      target: { value: 'não existe' },
    })
    expect(screen.getByText('Nenhuma conversa encontrada.')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Buscar conversa'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'resolved' } })
    expect(screen.getByText('Nenhuma conversa encontrada.')).toBeTruthy()
  })

  it('declara o modo demo e não fabrica conversas', () => {
    renderScreen({ conversations: [], isLive: false })

    expect(screen.getByText(/modo demonstração/i)).toBeTruthy()
    expect(screen.getByText('Ainda não há conversas.')).toBeTruthy()
  })
})

/**
 * A Inbox era somente leitura: status, responsável e não lidas apareciam na
 * tela e não havia como mexer em nenhum deles.
 */
describe('atender a conversa', () => {
  it('troca o status e grava o valor escolhido', async () => {
    const onChangeStatus = vi.fn().mockResolvedValue(null)
    renderScreen({ onChangeStatus })

    fireEvent.change(screen.getByLabelText('Status da conversa'), { target: { value: 'resolved' } })

    await waitFor(() => expect(onChangeStatus).toHaveBeenCalledWith(conversation.id, 'resolved'))
  })

  it('escolher o status atual não dispara escrita', () => {
    // Um UPDATE que grava o mesmo valor mexe `updated_at` e reordena a lista
    // sem que nada tenha acontecido.
    const onChangeStatus = vi.fn().mockResolvedValue(null)
    renderScreen({ onChangeStatus })

    fireEvent.change(screen.getByLabelText('Status da conversa'), { target: { value: conversation.status } })

    expect(onChangeStatus).not.toHaveBeenCalled()
  })

  it('define o responsável', async () => {
    const onAssign = vi.fn().mockResolvedValue(null)
    renderScreen({ onAssign })

    fireEvent.change(screen.getByLabelText('Responsável'), { target: { value: 'user-2' } })

    await waitFor(() => expect(onAssign).toHaveBeenCalledWith(conversation.id, 'user-2'))
  })

  it('devolve para a fila mandando null, e não string vazia', async () => {
    const onAssign = vi.fn().mockResolvedValue(null)
    renderScreen({ onAssign })

    fireEvent.change(screen.getByLabelText('Responsável'), { target: { value: '' } })

    await waitFor(() => expect(onAssign).toHaveBeenCalledWith(conversation.id, null))
  })

  it('a recusa do banco vira alerta, e não silêncio', async () => {
    const onChangeStatus = vi.fn().mockResolvedValue('Falta policy de escrita.')
    renderScreen({ onChangeStatus })

    fireEvent.change(screen.getByLabelText('Status da conversa'), { target: { value: 'pending' } })

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Falta policy de escrita.'))
  })

  it('sem permissão de escrita, os controles não aparecem', () => {
    renderScreen({ isLive: false })

    expect(screen.queryByLabelText('Status da conversa')).toBeNull()
    expect(screen.getByText('Responsável: Ana Costa')).toBeTruthy()
  })
})

describe('marcar leitura', () => {
  it('abrir conversa com não lidas zera o contador', async () => {
    const onMarkRead = vi.fn().mockResolvedValue(null)
    renderScreen({ conversations: [{ ...conversation, id: 'c2' }, conversation], onMarkRead })

    fireEvent.click(screen.getAllByRole('button', { name: /Maria Silva/ })[1])

    await waitFor(() => expect(onMarkRead).toHaveBeenCalledWith(conversation.id))
  })

  it('conversa já lida não dispara escrita nenhuma', () => {
    /*
     * Sem esta guarda, cada clique numa conversa lida gravaria no banco e
     * mexeria `updated_at`, reordenando a lista sozinha.
     */
    const onMarkRead = vi.fn().mockResolvedValue(null)
    renderScreen({ conversations: [{ ...conversation, unreadCount: 0 }], onMarkRead })

    fireEvent.click(screen.getAllByRole('button', { name: /Maria Silva/ })[0])

    expect(onMarkRead).not.toHaveBeenCalled()
  })

  it('em modo leitura, abrir a conversa não escreve', () => {
    const onMarkRead = vi.fn().mockResolvedValue(null)
    renderScreen({ isLive: false, onMarkRead })

    fireEvent.click(screen.getAllByRole('button', { name: /Maria Silva/ })[0])

    expect(onMarkRead).not.toHaveBeenCalled()
  })
})

describe('filtro por responsável', () => {
  const semDono: InboxConversationDto = { ...conversation, id: 'c3', contactName: 'João Souza', patientId: null, patientName: null, assignedTo: null, messages: [] }

  it('separa as conversas sem responsável', () => {
    renderScreen({ conversations: [conversation, semDono] })

    fireEvent.change(screen.getByLabelText('Atribuída a'), { target: { value: 'unassigned' } })

    // Aparece duas vezes: na lista e no cabecalho do detalhe, que passa a
    // mostrar a unica conversa restante.
    expect(screen.getAllByText('João Souza').length).toBeGreaterThan(0)
    expect(screen.queryByText('Maria Silva')).toBeNull()
  })
})

describe('falha de leitura', () => {
  it('mostra o erro em vez de fingir inbox vazia', () => {
    /*
     * A rota carregava sem `try`: qualquer falha derrubava a página inteira no
     * boundary de erro, sem dizer o que houve.
     */
    renderScreen({ conversations: [], loadError: 'Não foi possível falar com o servidor agora.' })

    expect(screen.getByRole('alert').textContent).toContain('servidor')
  })

  it('falha de leitura também bloqueia escrita', () => {
    renderScreen({ loadError: 'Falha de leitura.' })

    expect(screen.queryByLabelText('Status da conversa')).toBeNull()
  })
})
