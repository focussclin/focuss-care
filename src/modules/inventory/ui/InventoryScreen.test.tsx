// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { InventoryItemDto } from '../schemas/inventory.schema'
import { InventoryScreen } from './InventoryScreen'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const item: InventoryItemDto = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Luvas descartáveis',
  sku: 'LUV-001',
  unit: 'caixa',
  minimumQuantity: 2,
  currentQuantity: 1,
  notes: null,
  isActive: true,
  updatedAt: '2026-08-09T10:00:00.000Z',
}

afterEach(cleanup)

describe('InventoryScreen', () => {
  it('não fabrica itens no modo demonstração', () => {
    render(
      <InventoryScreen
        items={[]}
        movements={[]}
        onSubmitItem={vi.fn()}
        onToggleItem={vi.fn()}
        onRecordMovement={vi.fn()}
        isLive={false}
      />,
    )

    expect(screen.getByText('Nenhum item cadastrado')).toBeTruthy()
    expect(screen.getByText(/modo demonstração/i)).toBeTruthy()
  })

  it('mostra alerta de estoque mínimo e registra uma entrada', async () => {
    const onRecordMovement = vi.fn().mockResolvedValue(null)
    render(
      <InventoryScreen
        items={[item]}
        movements={[]}
        onSubmitItem={vi.fn()}
        onToggleItem={vi.fn()}
        onRecordMovement={onRecordMovement}
        isLive
      />,
    )

    expect(screen.getAllByText('Abaixo do mínimo')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /movimentar/i }))
    fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))

    await waitFor(() => expect(onRecordMovement).toHaveBeenCalledWith(expect.objectContaining({
      itemId: item.id,
      movementType: 'in',
      quantity: 3,
    })))
  })

  it('abre criação e envia o cadastro sem saldo fictício', async () => {
    const onSubmitItem = vi.fn().mockResolvedValue(null)
    render(
      <InventoryScreen
        items={[]}
        movements={[]}
        onSubmitItem={onSubmitItem}
        onToggleItem={vi.fn()}
        onRecordMovement={vi.fn()}
        isLive
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: /novo item/i })[0])
    fireEvent.change(screen.getByLabelText('Nome do item'), { target: { value: 'Seringa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar item' }))

    await waitFor(() => expect(onSubmitItem).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Seringa',
      minimumQuantity: 0,
    }), null))
  })
})
