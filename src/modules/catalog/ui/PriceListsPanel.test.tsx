// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PriceListDto } from '../schemas/priceList.schema'
import { PriceListsPanel } from './PriceListsPanel'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const list: PriceListDto = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Convênio Aurora',
  isDefault: false,
  validFrom: null,
  validUntil: null,
  isActive: true,
  items: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      serviceId: '22222222-2222-4222-8222-222222222222',
      serviceName: 'Consulta clínica',
      serviceCode: 'CONS01',
      priceCents: 18_000,
    },
  ],
}

const services = [
  { id: '22222222-2222-4222-8222-222222222222', name: 'Consulta clínica' },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Ultrassom' },
]

afterEach(cleanup)

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof PriceListsPanel>> = {},
) {
  return render(
    <PriceListsPanel
      lists={[list]}
      services={services}
      onSubmitList={vi.fn().mockResolvedValue(null)}
      onSetActive={vi.fn().mockResolvedValue(null)}
      onSetDefault={vi.fn().mockResolvedValue(null)}
      onSetItemPrice={vi.fn().mockResolvedValue(null)}
      onRemoveItem={vi.fn().mockResolvedValue(null)}
      canManage
      isLive
      {...overrides}
    />,
  )
}

/**
 * O repasse ao profissional não é gerenciado aqui, e a tela diz por quê.
 */
describe('repasse ao profissional', () => {
  it('a ausência é explicada, e não omitida', () => {
    renderPanel()

    expect(screen.getByText(/repasse ao profissional não é gerenciado aqui/i)).toBeTruthy()
  })

  it('não há campo de percentual nem de repasse', () => {
    /*
     * `price_list_items` guarda percentual E centavos, e nada declara qual
     * vence. Um campo aqui gravaria um número que vira dinheiro no bolso de
     * alguém, sob uma convenção adivinhada.
     */
    renderPanel()

    expect(screen.queryByLabelText(/repasse|percentual/i)).toBeNull()
  })
})

describe('tabelas', () => {
  it('mostra o preço do serviço na tabela selecionada', () => {
    renderPanel()

    expect(screen.getByText('Consulta clínica')).toBeTruthy()
    expect(screen.getByText('R$ 180,00')).toBeTruthy()
  })

  it('a tabela padrão é marcada', () => {
    renderPanel({ lists: [{ ...list, isDefault: true }] })

    expect(screen.getByText('Padrão')).toBeTruthy()
    // Já sendo padrão, não oferece promover de novo.
    expect(screen.queryByRole('button', { name: /tornar padrão/i })).toBeNull()
  })

  it('promover manda a tabela escolhida', async () => {
    const onSetDefault = vi.fn().mockResolvedValue(null)
    renderPanel({ onSetDefault })

    fireEvent.click(screen.getByRole('button', { name: /tornar padrão/i }))

    await waitFor(() => expect(onSetDefault).toHaveBeenCalledWith(list.id))
  })

  it('tabela fora da vigência continua visível, e é sinalizada', () => {
    /*
     * Quem fatura um atendimento antigo precisa dela — some da vigência, não da
     * lista.
     */
    renderPanel({ lists: [{ ...list, validUntil: '2020-01-01T00:00:00.000Z' }] })

    // Aparece duas vezes: na lista lateral e no cabeçalho da selecionada.
    expect(screen.getAllByText('Convênio Aurora').length).toBeGreaterThan(0)
    expect(screen.getByText(/fora da vigência/i)).toBeTruthy()
  })

  it('vazio explica que o particular já está no catálogo', () => {
    renderPanel({ lists: [] })

    expect(screen.getByText(/o catálogo já guarda o preço particular/i)).toBeTruthy()
  })

  it('janela invertida não chega ao servidor', async () => {
    const onSubmitList = vi.fn().mockResolvedValue(null)
    renderPanel({ lists: [], onSubmitList })

    fireEvent.click(screen.getByRole('button', { name: /nova tabela/i }))
    fireEvent.change(screen.getByLabelText('Nome da tabela'), { target: { value: 'Aurora' } })
    fireEvent.change(screen.getByLabelText('Vigência a partir de'), {
      target: { value: '2026-12-01' },
    })
    fireEvent.change(screen.getByLabelText('Vigência até'), {
      target: { value: '2026-01-01' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar tabela' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/antes do fim/i))
    expect(onSubmitList).not.toHaveBeenCalled()
  })
})

describe('preços', () => {
  it('só oferece serviços ainda não precificados', () => {
    /*
     * Oferecer um serviço que já tem preço abriria a porta para o segundo item,
     * que é justamente o que não pode existir.
     */
    renderPanel()

    const options = [...screen.getByLabelText('Serviço').querySelectorAll('option')].map(
      (option) => option.textContent,
    )

    expect(options).toEqual(['Escolha um serviço', 'Ultrassom'])
  })

  it('grava o preço em centavos', async () => {
    const onSetItemPrice = vi.fn().mockResolvedValue(null)
    renderPanel({ onSetItemPrice })

    fireEvent.change(screen.getByLabelText('Serviço'), { target: { value: services[1].id } })
    fireEvent.change(screen.getByLabelText('Preço'), { target: { value: 'R$ 90,00' } })
    fireEvent.click(screen.getByRole('button', { name: /adicionar preço/i }))

    await waitFor(() =>
      expect(onSetItemPrice).toHaveBeenCalledWith(list.id, services[1].id, 9_000),
    )
  })

  it('sem serviço escolhido, avisa em vez de gravar', async () => {
    const onSetItemPrice = vi.fn().mockResolvedValue(null)
    renderPanel({ onSetItemPrice })

    fireEvent.change(screen.getByLabelText('Preço'), { target: { value: 'R$ 90,00' } })
    fireEvent.click(screen.getByRole('button', { name: /adicionar preço/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(onSetItemPrice).not.toHaveBeenCalled()
  })

  it('remove o item escolhido', async () => {
    const onRemoveItem = vi.fn().mockResolvedValue(null)
    renderPanel({ onRemoveItem })

    fireEvent.click(screen.getByRole('button', { name: /remover/i }))

    await waitFor(() => expect(onRemoveItem).toHaveBeenCalledWith(list.id, list.items[0].id))
  })
})

describe('permissão e falhas', () => {
  it('sem `clinic.settings`, nada de escrever', () => {
    renderPanel({ canManage: false })

    expect(screen.getByRole('button', { name: /nova tabela/i }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: /adicionar preço/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /tornar padrão/i })).toBeNull()
  })

  it('a recusa do servidor aparece', async () => {
    const onSetDefault = vi.fn().mockResolvedValue('Falta policy de escrita.')
    renderPanel({ onSetDefault })

    fireEvent.click(screen.getByRole('button', { name: /tornar padrão/i }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('policy'))
  })

  it('modo demonstração não fabrica tabela', () => {
    renderPanel({ lists: [], isLive: false })

    expect(screen.getByRole('status').textContent).toMatch(/modo demonstração/i)
  })

  it('falha de leitura aparece e bloqueia a escrita', () => {
    renderPanel({ lists: [], loadError: 'Não foi possível falar com o servidor agora.' })

    expect(screen.getByRole('alert').textContent).toContain('servidor')
    expect(screen.getByRole('button', { name: /nova tabela/i }).hasAttribute('disabled')).toBe(true)
  })
})
