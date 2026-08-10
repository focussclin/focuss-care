// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RoomsScreen } from './RoomsScreen'
import type { RoomGroupDto, RoomsScreenProps } from './RoomsScreen.props'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

/**
 * A tela de salas e recursos.
 *
 * A partir de 10/08/2026 ela recebe **grupos prontos** em vez da lista crua: o
 * agrupamento vive em `application/toRoomGroups`, e é lá que a ordem tem teste.
 * Aqui se verifica o que só a tela pode garantir — o que aparece, o que fica
 * desabilitado, e o que cada confirmação promete.
 */

const groups: RoomGroupDto[] = [
  {
    kind: 'consultorio',
    rooms: [
      {
        id: 'room-1',
        name: 'Consultório 1',
        kind: 'consultorio',
        capacity: 3,
        notes: 'Térreo',
        isActive: true,
      },
    ],
  },
  {
    kind: 'sala_exame',
    rooms: [
      {
        id: 'room-2',
        name: 'Sala de exames',
        kind: 'sala_exame',
        capacity: 2,
        notes: null,
        isActive: false,
      },
    ],
  },
]

afterEach(cleanup)

function renderScreen(overrides: Partial<RoomsScreenProps> = {}) {
  const props: RoomsScreenProps = {
    groups,
    onSubmit: vi.fn().mockResolvedValue(null),
    onToggleActive: vi.fn().mockResolvedValue(null),
    onArchive: vi.fn().mockResolvedValue(null),
    isLive: true,
    ...overrides,
  }

  render(<RoomsScreen {...props} />)

  return props
}

describe('RoomsScreen', () => {
  it('organiza os recursos por tipo e mostra seus estados', () => {
    renderScreen()

    expect(screen.getByRole('heading', { name: 'Consultórios' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Salas de exame' })).toBeTruthy()
    expect(screen.getByText('Consultório 1')).toBeTruthy()
    expect(screen.getByText('Sala de exames')).toBeTruthy()
    expect(screen.getByText('Ativo')).toBeTruthy()
    expect(screen.getByText('Inativo')).toBeTruthy()
  })

  it('não monta cabeçalho de grupo que não veio', () => {
    // Seção vazia se lê como coisa quebrada, não como ausência. Quem decide
    // isso é `toRoomGroups`; aqui se confirma que a tela não a reintroduz.
    renderScreen()

    expect(screen.queryByRole('heading', { name: 'Equipamentos' })).toBeNull()
  })

  it('não oferece gravação enquanto a migration está pendente', () => {
    renderScreen({ groups: [], schemaPending: true })

    expect(screen.getByRole('status').textContent).toMatch(/migration/i)
    expect(
      screen.getByRole('button', { name: /nova sala/i }).hasAttribute('disabled'),
    ).toBe(true)
    expect(
      screen
        .getByRole('button', { name: /cadastrar primeira sala/i })
        .hasAttribute('disabled'),
    ).toBe(true)
  })

  it('envia a criação com capacidade convertida para número', async () => {
    const { onSubmit } = renderScreen({ groups: [] })

    fireEvent.click(screen.getByRole('button', { name: /cadastrar primeira sala/i }))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Sala 1' } })
    fireEvent.change(screen.getByLabelText('Capacidade'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar recurso/i }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        { name: 'Sala 1', kind: 'consultorio', capacity: 4, notes: '' },
        null,
      ),
    )
  })

  it('confirma a desativação e informa que o histórico permanece', async () => {
    const { onToggleActive } = renderScreen()

    fireEvent.click(screen.getByRole('button', { name: /^desativar$/i }))
    expect(
      screen.getByText(/atendimentos já registrados continuam preservados/i),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /desativar recurso/i }))

    await waitFor(() => expect(onToggleActive).toHaveBeenCalledWith('room-1', false))
  })

  it('remover só existe para a sala já inativa', () => {
    /*
     * Desativar é reversível; remover não é. Pôr as duas lado a lado com o
     * mesmo peso convida ao clique errado justamente na que não se desfaz.
     */
    renderScreen()

    expect(
      screen.getByRole('button', { name: /remover sala de exames/i }),
    ).toBeTruthy()
    expect(
      screen.queryByRole('button', { name: /remover consultório 1/i }),
    ).toBeNull()
  })

  it('a remoção diz o que NÃO acontece com o histórico', async () => {
    /*
     * `appointments.room_id` referencia a linha, então remover não apaga: quem
     * espera que limpe rastro precisa saber que não é isso, e quem teme perder
     * o histórico precisa saber que não vai perder.
     */
    const { onArchive } = renderScreen()

    fireEvent.click(screen.getByRole('button', { name: /remover sala de exames/i }))

    expect(screen.getByText(/continuam no histórico/i)).toBeTruthy()
    expect(screen.getByText(/o nome volta a ficar disponível/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^remover$/i }))

    await waitFor(() => expect(onArchive).toHaveBeenCalledWith('room-2'))
  })

  it('a recusa da remoção mantém o diálogo aberto, com o motivo', async () => {
    /*
     * Contrato do `ConfirmDialog`: só o `null` fecha. Fechar limpo sobre uma
     * sala que continua no cadastro é o defeito que aquele componente existe
     * para impedir.
     */
    renderScreen({
      onArchive: vi.fn().mockResolvedValue('Esta sala tem atendimentos futuros.'),
    })

    fireEvent.click(screen.getByRole('button', { name: /remover sala de exames/i }))
    fireEvent.click(screen.getByRole('button', { name: /^remover$/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Esta sala tem atendimentos futuros.',
      ),
    )
  })

  it('em demonstração, nada é gravável', () => {
    renderScreen({ isLive: false })

    expect(
      screen.getByRole('button', { name: /nova sala/i }).hasAttribute('disabled'),
    ).toBe(true)
    expect(
      screen
        .getByRole('button', { name: /remover sala de exames/i })
        .hasAttribute('disabled'),
    ).toBe(true)
  })
})
