// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ServiceDto } from '../schemas/service.schema'
import { CatalogScreen } from './CatalogScreen'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const consulta: ServiceDto = {
  id: '11111111-1111-4111-8111-111111111111',
  code: 'CONS01',
  tussCode: '10101012',
  name: 'Consulta clínica',
  description: null,
  category: 'Consultas',
  defaultDurationMinutes: 30,
  defaultPriceCents: 25_000,
  requiresAuthorization: false,
  isActive: true,
}

afterEach(cleanup)

function renderScreen(overrides: Partial<React.ComponentProps<typeof CatalogScreen>> = {}) {
  return render(
    <CatalogScreen
      services={[consulta]}
      onSubmit={vi.fn().mockResolvedValue(null)}
      onSetActive={vi.fn().mockResolvedValue(null)}
      onDelete={vi.fn().mockResolvedValue(null)}
      canManage
      canSeePrice
      isLive
      {...overrides}
    />,
  )
}

/**
 * A matriz é explícita: "`receptionist` não vê valor nenhum — marcar consulta
 * não exige saber quanto ela custa". O preço é omitido no SERVIDOR; aqui se
 * verifica que a tela não o reinventa.
 */
describe('o preço respeita a matriz de permissões', () => {
  it('quem tem `invoice.read` vê o valor', () => {
    renderScreen()

    expect(screen.getByText('R$ 250,00')).toBeTruthy()
  })

  it('sem `invoice.read` o valor não aparece — e nem chegou', () => {
    renderScreen({
      canSeePrice: false,
      services: [{ ...consulta, defaultPriceCents: null }],
    })

    expect(screen.queryByText(/R\$/)).toBeNull()
    expect(screen.getByText(/não exibe valores/i)).toBeTruthy()
  })

  it('nome, código e duração continuam disponíveis sem preço', () => {
    // Sem eles a recepção não marca; o que se protege é o valor.
    renderScreen({
      canSeePrice: false,
      services: [{ ...consulta, defaultPriceCents: null }],
    })

    expect(screen.getByText('Consulta clínica')).toBeTruthy()
    expect(screen.getByText(/CONS01/)).toBeTruthy()
    expect(screen.getByText(/30 min/)).toBeTruthy()
  })

  it('preço nulo não vira zero no formulário', () => {
    /*
     * Zero é um preço. Abrir o campo zerado e salvar sem perceber transformaria
     * um serviço de R$ 250 em gratuito.
     */
    renderScreen({
      canSeePrice: false,
      services: [{ ...consulta, defaultPriceCents: null }],
    })

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))

    expect((screen.getByLabelText('Preço base') as HTMLInputElement).value).toBe('')
  })
})

describe('busca e filtros', () => {
  const exame: ServiceDto = {
    ...consulta,
    id: 'exame',
    name: 'Ultrassom',
    code: 'USG10',
    tussCode: '40901114',
    category: 'Exames',
  }
  const antigo: ServiceDto = {
    ...consulta,
    id: 'antigo',
    name: 'Consulta antiga',
    code: 'OLD',
    isActive: false,
  }

  it('começa mostrando só os ativos', () => {
    renderScreen({ services: [consulta, antigo] })

    expect(screen.getByText('Consulta clínica')).toBeTruthy()
    expect(screen.queryByText('Consulta antiga')).toBeNull()
  })

  it('a busca alcança o código, não só o nome', () => {
    // Quem fatura procura pelo código; quem agenda, pelo nome.
    renderScreen({ services: [consulta, exame] })

    fireEvent.change(screen.getByLabelText('Buscar serviço'), { target: { value: 'usg10' } })

    expect(screen.getByText('Ultrassom')).toBeTruthy()
    expect(screen.queryByText('Consulta clínica')).toBeNull()
  })

  it('as categorias vêm do que está cadastrado', () => {
    /*
     * Uma lista fixa seria uma taxonomia que o produto impõe a clínicas que já
     * têm a delas.
     */
    renderScreen({ services: [consulta, exame] })

    const options = [...screen.getByLabelText('Categoria').querySelectorAll('option')].map(
      (option) => option.textContent,
    )

    expect(options).toEqual(['Todas as categorias', 'Consultas', 'Exames'])
  })

  it('mostrar todos traz os desativados', () => {
    renderScreen({ services: [consulta, antigo] })

    fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'all' } })

    expect(screen.getByText('Consulta antiga')).toBeTruthy()
    expect(screen.getByText('Desativado')).toBeTruthy()
  })
})

describe('cadastro', () => {
  it('envia o serviço com o preço em centavos', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null)
    renderScreen({ services: [], onSubmit })

    fireEvent.click(screen.getAllByRole('button', { name: /novo serviço/i })[0])
    fireEvent.change(screen.getByLabelText('Nome do serviço'), { target: { value: 'Retorno' } })
    fireEvent.change(screen.getByLabelText('Preço base'), { target: { value: 'R$ 120,00' } })
    fireEvent.change(screen.getByLabelText('Duração em minutos'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar serviço' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Retorno',
          defaultPriceCents: 12_000,
          defaultDurationMinutes: '20',
        }),
        null,
      ),
    )
  })

  it('nome vazio não chega ao servidor', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null)
    renderScreen({ services: [], onSubmit })

    fireEvent.click(screen.getAllByRole('button', { name: /novo serviço/i })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Salvar serviço' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('editar carrega o que está gravado e manda o id', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null)
    renderScreen({ onSubmit })

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    expect((screen.getByLabelText('Nome do serviço') as HTMLInputElement).value).toBe(
      'Consulta clínica',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Salvar serviço' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.anything(), consulta.id),
    )
  })

  it('código duplicado aparece dentro do modal', async () => {
    const onSubmit = vi.fn().mockResolvedValue('Já existe um serviço com este código.')
    renderScreen({ onSubmit })

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar serviço' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/já existe um serviço/i),
    )
  })
})

describe('desativar e excluir', () => {
  it('desativar manda o oposto do estado atual', async () => {
    const onSetActive = vi.fn().mockResolvedValue(null)
    renderScreen({ onSetActive })

    fireEvent.click(screen.getByRole('button', { name: /desativar/i }))

    await waitFor(() => expect(onSetActive).toHaveBeenCalledWith(consulta.id, false))
  })

  it('excluir passa por confirmação que explica a exclusão lógica', async () => {
    const onDelete = vi.fn().mockResolvedValue(null)
    renderScreen({ onDelete })

    fireEvent.click(screen.getByRole('button', { name: /^excluir$/i }))
    expect(screen.getByText(/faturas antigas continuam sabendo/i)).toBeTruthy()
    expect(onDelete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Excluir serviço' }))
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(consulta.id))
  })
})

describe('permissão e falhas', () => {
  it('sem `clinic.settings`, nada de escrever', () => {
    renderScreen({ canManage: false })

    expect(screen.queryByRole('button', { name: /editar/i })).toBeNull()
    expect(screen.getByRole('button', { name: /novo serviço/i }).hasAttribute('disabled')).toBe(true)
  })

  it('modo demonstração não fabrica serviço nem preço', () => {
    renderScreen({ services: [], isLive: false })

    expect(screen.getByRole('status').textContent).toMatch(/preço inventado/i)
    expect(screen.getByText('Catálogo vazio')).toBeTruthy()
  })

  it('falha de leitura aparece e bloqueia a escrita', () => {
    renderScreen({ services: [], loadError: 'Não foi possível falar com o servidor agora.' })

    expect(screen.getByRole('alert').textContent).toContain('servidor')
    expect(screen.queryByText('Catálogo vazio')).toBeNull()
    expect(screen.getByRole('button', { name: /novo serviço/i }).hasAttribute('disabled')).toBe(true)
  })
})
