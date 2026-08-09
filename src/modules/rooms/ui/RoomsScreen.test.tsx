// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RoomsScreen } from './RoomsScreen'
import type { RoomDto } from './RoomsScreen.props'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const rooms: RoomDto[] = [
  {
    id: 'room-1',
    name: 'Consultório 1',
    kind: 'consultorio',
    capacity: 3,
    notes: 'Térreo',
    isActive: true,
  },
  {
    id: 'room-2',
    name: 'Sala de exames',
    kind: 'sala_exame',
    capacity: 2,
    notes: null,
    isActive: false,
  },
]

afterEach(cleanup)

describe('RoomsScreen', () => {
  it('organiza os recursos por tipo e mostra seus estados', () => {
    render(
      <RoomsScreen
        rooms={rooms}
        onSubmit={vi.fn().mockResolvedValue(null)}
        onToggleActive={vi.fn().mockResolvedValue(null)}
        isLive
      />,
    )

    expect(screen.getByRole('heading', { name: 'Consultórios' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Salas de exame' })).toBeTruthy()
    expect(screen.getByText('Consultório 1')).toBeTruthy()
    expect(screen.getByText('Sala de exames')).toBeTruthy()
    expect(screen.getByText('Ativo')).toBeTruthy()
    expect(screen.getByText('Inativo')).toBeTruthy()
  })

  it('não oferece gravação enquanto a migration está pendente', () => {
    render(
      <RoomsScreen
        rooms={[]}
        onSubmit={vi.fn()}
        onToggleActive={vi.fn()}
        isLive
        schemaPending
      />,
    )

    expect(screen.getByRole('status').textContent).toMatch(/migration/i)
    expect(screen.getByRole('button', { name: /nova sala/i }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: /cadastrar primeira sala/i }).hasAttribute('disabled')).toBe(true)
  })

  it('envia a criação com capacidade convertida para número', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null)

    render(
      <RoomsScreen
        rooms={[]}
        onSubmit={onSubmit}
        onToggleActive={vi.fn().mockResolvedValue(null)}
        isLive
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /cadastrar primeira sala/i }))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Sala 1' } })
    fireEvent.change(screen.getByLabelText('Capacidade'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar recurso/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(
      { name: 'Sala 1', kind: 'consultorio', capacity: 4, notes: '' },
      null,
    ))
  })

  it('confirma a desativação e informa que o histórico permanece', async () => {
    const onToggleActive = vi.fn().mockResolvedValue(null)

    render(
      <RoomsScreen
        rooms={rooms}
        onSubmit={vi.fn().mockResolvedValue(null)}
        onToggleActive={onToggleActive}
        isLive
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /desativar/i }))
    expect(screen.getByText(/atendimentos já registrados continuam preservados/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /desativar recurso/i }))

    await waitFor(() => expect(onToggleActive).toHaveBeenCalledWith('room-1', false))
  })
})
