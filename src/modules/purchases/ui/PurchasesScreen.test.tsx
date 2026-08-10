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

/**
 * Os botões de transição saem da máquina de estados do domínio.
 *
 * O mapa que existia aqui era LINEAR — `draft → requested → approved →
 * ordered` — e deixava de fora dois caminhos que o banco sempre permitiu.
 * Sem eles, a única saída de um pedido com problema era cancelar e refazer,
 * perdendo o histórico de quem pediu o quê.
 *
 * O outro lado importa igual: a tela não pode oferecer transição que o banco
 * recusa, senão o botão sempre falha. `Purchase.test.ts` compara a tabela com
 * o SQL; aqui se verifica que a tela usa a tabela.
 */
describe('transições do pedido', () => {
  const withStatus = (status: PurchaseOrderDto['status']) =>
    renderScreen({ orders: [{ ...order, status }] })

  it('rascunho oferece enviar para aprovação, e não aprovar', () => {
    // Aprovar sem alguém ter solicitado apagaria o passo em que a compra é
    // conferida — que é a razão de o fluxo existir.
    withStatus('draft')

    expect(screen.getByRole('button', { name: /enviar para aprovação/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^aprovar pedido$/i })).toBeNull()
  })

  it('solicitado oferece DEVOLVER PARA AJUSTE', async () => {
    /*
     * O caminho que faltava. Um pedido que chega para aprovação com a
     * quantidade errada precisa voltar para rascunho — não ser cancelado.
     */
    const onTransitionOrder = vi.fn().mockResolvedValue(null)
    renderScreen({ orders: [{ ...order, status: 'requested' }], onTransitionOrder })

    fireEvent.click(screen.getByRole('button', { name: /devolver para ajuste/i }))

    await waitFor(() =>
      expect(onTransitionOrder).toHaveBeenCalledWith(order.id, 'draft'),
    )
  })

  it('aprovado oferece RETIRAR APROVAÇÃO, com o verbo certo', async () => {
    /*
     * Mesmo destino (`requested`) com significado oposto conforme a origem.
     * "Enviar para aprovação" sobre um pedido já aprovado seria a tela
     * contradizendo o próprio selo de status.
     */
    const onTransitionOrder = vi.fn().mockResolvedValue(null)
    renderScreen({ orders: [{ ...order, status: 'approved' }], onTransitionOrder })

    expect(screen.queryByRole('button', { name: /enviar para aprovação/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /retirar aprovação/i }))

    await waitFor(() =>
      expect(onTransitionOrder).toHaveBeenCalledWith(order.id, 'requested'),
    )
  })

  it('enviado ao fornecedor não oferece avanço manual de estado', () => {
    /*
     * `partially_received` e `received` são derivados da soma das quantidades
     * pela função de recebimento. Um botão que os escolhesse na tela diria que
     * a mercadoria chegou sem ninguém ter conferido.
     */
    withStatus('ordered')

    expect(screen.queryByRole('button', { name: /marcar como enviado/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /registrar recebimento/i })).toBeNull()
    expect(screen.getByRole('button', { name: /^cancelar$/i })).toBeTruthy()
  })

  it('estado final não oferece transição nenhuma', () => {
    withStatus('received')

    expect(screen.queryByRole('button', { name: /^cancelar$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /aprovar|devolver|enviar para/i })).toBeNull()
  })

  it('cancelado também não volta', () => {
    withStatus('cancelled')

    expect(screen.queryByRole('button', { name: /devolver|aprovar|enviar para/i })).toBeNull()
  })

  it('sem permissão de escrita, nenhuma transição é oferecida', () => {
    renderScreen({ orders: [{ ...order, status: 'draft' }], isLive: false })

    expect(screen.queryByRole('button', { name: /enviar para aprovação/i })).toBeNull()
  })
})
