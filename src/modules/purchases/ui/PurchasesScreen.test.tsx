// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PurchaseCatalogItemDto, PurchaseOrderDto, PurchaseSupplierDto } from '../schemas/purchase.schema'
import { PurchasesScreen } from './PurchasesScreen'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const supplier: PurchaseSupplierDto = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Distribuidora Saúde',
  taxId: null,
  email: 'contato@example.com',
  phone: null,
  notes: null,
  isActive: true,
  updatedAt: '2026-08-09T10:00:00.000Z',
}

const catalog: PurchaseCatalogItemDto[] = [{
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Luvas descartáveis',
  unit: 'caixa',
  currentQuantity: 3,
}]

const order: PurchaseOrderDto = {
  id: '00000000-0000-4000-8000-000000000003',
  supplier: { id: supplier.id, name: supplier.name },
  status: 'ordered',
  expectedDeliveryDate: '2026-08-20',
  totalCents: 2500,
  notes: null,
  items: [{
    id: '00000000-0000-4000-8000-000000000004',
    inventoryItemId: catalog[0].id,
    inventoryItemName: catalog[0].name,
    inventoryItemUnit: catalog[0].unit,
    quantity: 2,
    unitCostCents: 1250,
    receivedQuantity: 0,
  }],
  createdAt: '2026-08-09T10:00:00.000Z',
  updatedAt: '2026-08-09T10:00:00.000Z',
}

afterEach(cleanup)

function renderScreen(overrides: Partial<React.ComponentProps<typeof PurchasesScreen>> = {}) {
  return render(
    <PurchasesScreen
      suppliers={[supplier]}
      catalog={catalog}
      orders={[order]}
      onSubmitSupplier={vi.fn().mockResolvedValue(null)}
      onToggleSupplier={vi.fn().mockResolvedValue(null)}
      onSubmitOrder={vi.fn().mockResolvedValue(null)}
      onTransitionOrder={vi.fn().mockResolvedValue(null)}
      onReceiveOrderItem={vi.fn().mockResolvedValue(null)}
      isLive
      {...overrides}
    />,
  )
}

describe('PurchasesScreen', () => {
  it('mostra pedido, status e valor sem fabricar dados', () => {
    renderScreen()

    expect(screen.getByRole('heading', { name: 'Compras' })).toBeTruthy()
    expect(screen.getByText('Distribuidora Saúde')).toBeTruthy()
    expect(screen.getAllByText('Pedido enviado').length).toBeGreaterThan(0)
    expect(screen.getAllByText('R$ 25,00').length).toBeGreaterThan(0)
    expect(screen.getByText('Luvas descartáveis')).toBeTruthy()
  })

  it('registra recebimento da linha ligada ao pedido', async () => {
    const onReceiveOrderItem = vi.fn().mockResolvedValue(null)
    renderScreen({ onReceiveOrderItem })

    fireEvent.click(screen.getByRole('button', { name: 'Receber' }))
    fireEvent.change(screen.getByLabelText(/quantidade a receber/i), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar recebimento' }))

    await waitFor(() => expect(onReceiveOrderItem).toHaveBeenCalledWith(order.items[0].id, 2))
  })

  it('cria fornecedor pela tela sem liberar mutações com migration pendente', async () => {
    const onSubmitSupplier = vi.fn().mockResolvedValue(null)
    renderScreen({ suppliers: [], orders: [], onSubmitSupplier, schemaPending: true })

    expect(screen.getByRole('button', { name: /novo fornecedor/i }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('status').textContent).toMatch(/migration/i)

    cleanup()
    renderScreen({ suppliers: [], orders: [], onSubmitSupplier })
    fireEvent.click(screen.getAllByRole('button', { name: /novo fornecedor/i })[0])
    fireEvent.change(screen.getByLabelText('Nome do fornecedor'), { target: { value: '  Novo Parceiro  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar fornecedor' }))

    await waitFor(() => expect(onSubmitSupplier).toHaveBeenCalledWith(expect.objectContaining({ name: '  Novo Parceiro  ' }), null))
  })
})
