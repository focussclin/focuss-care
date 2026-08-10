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

function renderScreen(
  overrides: Partial<React.ComponentProps<typeof InventoryScreen>> = {},
) {
  return render(
    <InventoryScreen
      items={[]}
      movements={[]}
      onSubmitItem={vi.fn().mockResolvedValue(null)}
      onToggleItem={vi.fn().mockResolvedValue(null)}
      onRecordMovement={vi.fn().mockResolvedValue(null)}
      onCountItem={vi.fn().mockResolvedValue({ status: 'adjusted' })}
      isLive
      {...overrides}
    />,
  )
}

describe('InventoryScreen', () => {
  it('não fabrica itens no modo demonstração', () => {
    renderScreen({ isLive: false })

    expect(screen.getByText('Nenhum item cadastrado')).toBeTruthy()
    expect(screen.getByText(/modo demonstração/i)).toBeTruthy()
  })

  it('mostra alerta de estoque mínimo e registra uma entrada', async () => {
    const onRecordMovement = vi.fn().mockResolvedValue(null)
    renderScreen({ items: [item], onRecordMovement })

    expect(screen.getAllByText('Abaixo do mínimo')).toHaveLength(1)
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
    renderScreen({ onSubmitItem })

    fireEvent.click(screen.getAllByRole('button', { name: /novo item/i })[0])
    fireEvent.change(screen.getByLabelText('Nome do item'), { target: { value: 'Seringa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar item' }))

    await waitFor(() => expect(onSubmitItem).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Seringa',
      minimumQuantity: 0,
    }), null))
  })
})

/**
 * O ajuste manda o SALDO CONTADO, nunca a diferença.
 *
 * Quem subtrai é `set_inventory_quantity`, sob o lock da linha. Se a tela
 * mandasse a diferença, teria de ler o saldo para calculá-la, e duas contagens
 * simultâneas partiriam do mesmo número velho.
 */
describe('ajuste por contagem', () => {
  it('envia o valor contado, e não a diferença para o saldo', async () => {
    const onCountItem = vi.fn().mockResolvedValue({ status: 'adjusted' })
    renderScreen({ items: [item], onCountItem })

    fireEvent.click(screen.getByRole('button', { name: /contar/i }))
    fireEvent.change(screen.getByLabelText('Saldo contado'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contagem' }))

    // Saldo registrado é 1: a diferença seria 6.
    await waitFor(() =>
      expect(onCountItem).toHaveBeenCalledWith(expect.objectContaining({
        itemId: item.id,
        countedQuantity: 7,
      })),
    )
  })

  it('aceita zero — a prateleira vazia é uma contagem', async () => {
    const onCountItem = vi.fn().mockResolvedValue({ status: 'adjusted' })
    renderScreen({ items: [item], onCountItem })

    fireEvent.click(screen.getByRole('button', { name: /contar/i }))
    fireEvent.change(screen.getByLabelText('Saldo contado'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contagem' }))

    await waitFor(() =>
      expect(onCountItem).toHaveBeenCalledWith(expect.objectContaining({ countedQuantity: 0 })),
    )
  })

  it('não sugere o saldo atual no campo', () => {
    /*
     * Preencher com o saldo transforma "Salvar" em confirmar-o-que-já-está: a
     * pessoa contaria a prateleira e, na dúvida, aceitaria o número sugerido.
     */
    renderScreen({ items: [item] })

    fireEvent.click(screen.getByRole('button', { name: /contar/i }))

    expect((screen.getByLabelText('Saldo contado') as HTMLInputElement).value).toBe('')
  })

  it('contagem que confere vira aviso de sucesso, não erro', async () => {
    /*
     * `status: 'unchanged'` é o banco dizendo que a conferência bateu. Cair no
     * bloco `role="alert"` pintaria de vermelho um trabalho que deu certo.
     */
    const onCountItem = vi.fn().mockResolvedValue({ status: 'unchanged' })
    renderScreen({ items: [item], onCountItem })

    fireEvent.click(screen.getByRole('button', { name: /contar/i }))
    fireEvent.change(screen.getByLabelText('Saldo contado'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contagem' }))

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/confere com o saldo/i))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('falha do servidor continua indo para o alerta', async () => {
    const onCountItem = vi.fn().mockResolvedValue({ status: 'error', message: 'Sem permissão.' })
    renderScreen({ items: [item], onCountItem })

    fireEvent.click(screen.getByRole('button', { name: /contar/i }))
    fireEvent.change(screen.getByLabelText('Saldo contado'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar contagem' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Sem permissão.'))
  })

  it('sem permissão de escrita, a contagem fica bloqueada', () => {
    renderScreen({ items: [item], isLive: false })

    expect(screen.getByRole('button', { name: /contar/i }).hasAttribute('disabled')).toBe(true)
  })

  it('migration pendente bloqueia a contagem mesmo com permissão', () => {
    renderScreen({ items: [item], schemaPending: true })

    expect(screen.getByRole('button', { name: /contar/i }).hasAttribute('disabled')).toBe(true)
  })
})

describe('itens que precisam de reposição', () => {
  const zerado: InventoryItemDto = { ...item, id: '00000000-0000-4000-8000-000000000002', name: 'Máscara', sku: null, minimumQuantity: 0, currentQuantity: 0 }
  const saudavel: InventoryItemDto = { ...item, id: '00000000-0000-4000-8000-000000000003', name: 'Gaze', sku: null, minimumQuantity: 0, currentQuantity: 9 }

  it('item sem mínimo definido e sem saldo é "Sem saldo", não "Abaixo do mínimo"', () => {
    /*
     * `minimum_quantity` nasce 0 no banco. A regra antiga era
     * `atual <= mínimo`, então todo item recém-cadastrado aparecia em vermelho
     * acusando um mínimo que ninguém configurou.
     */
    renderScreen({ items: [zerado] })

    expect(screen.getByText('Sem saldo')).toBeTruthy()
    expect(screen.queryByText('Abaixo do mínimo')).toBeNull()
  })

  it('item sem mínimo definido mas com saldo não alarma', () => {
    renderScreen({ items: [saudavel] })

    expect(screen.getByText('Saldo saudável')).toBeTruthy()
  })

  it('o filtro "Repor" mostra só o que pede reposição', () => {
    renderScreen({ items: [item, zerado, saudavel] })

    fireEvent.change(screen.getByLabelText('Filtro'), { target: { value: 'restock' } })

    expect(screen.getByText('Luvas descartáveis')).toBeTruthy()
    expect(screen.getByText('Máscara')).toBeTruthy()
    expect(screen.queryByText('Gaze')).toBeNull()
  })

  it('nada para repor não vira "nenhum item encontrado"', () => {
    renderScreen({ items: [saudavel] })

    fireEvent.change(screen.getByLabelText('Filtro'), { target: { value: 'restock' } })

    expect(screen.getByText('Nada para repor')).toBeTruthy()
  })
})

describe('extrato de movimentações', () => {
  const base = { id: '00000000-0000-4000-8000-00000000000a', itemId: item.id, unitCostCents: null, reason: 'Consumo', createdAt: '2026-08-09T10:00:00.000Z' }

  it('separa ajuste de contagem de uma saída comum', () => {
    /*
     * As duas linhas são `out` de 3. Sem `countedQuantity`, "saíram 3 no
     * atendimento" e "contei e faltavam 3" ficam indistinguíveis — e só a
     * segunda responde quanto a clínica perde por quebra ou vencimento.
     */
    renderScreen({
      items: [item],
      movements: [
        { ...base, movementType: 'out', quantity: 3, countedQuantity: null },
        { ...base, id: '00000000-0000-4000-8000-00000000000b', movementType: 'out', quantity: 3, countedQuantity: 12, reason: 'Contagem mensal' },
      ],
    })

    expect(screen.getByText(/Ajuste · falta/)).toBeTruthy()
    expect(screen.getByText(/saldo apurado 12/)).toBeTruthy()
    expect(screen.getByText(/Saída · Consumo/)).toBeTruthy()
  })

  it('sobra na contagem aparece como ajuste de entrada', () => {
    renderScreen({
      items: [item],
      movements: [{ ...base, movementType: 'in', quantity: 2, countedQuantity: 3, reason: null }],
    })

    expect(screen.getByText(/Ajuste · sobra/)).toBeTruthy()
  })
})
