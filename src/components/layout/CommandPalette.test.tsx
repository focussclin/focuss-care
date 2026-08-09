// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CommandPalette, useCommandPaletteShortcut } from './CommandPalette'

/**
 * A paleta, agora com DOM.
 *
 * O ambiente jsdom é declarado no docblock desta linha 1 — o resto da suíte
 * continua em `node`, que é mais rápido e é o que a lógica pura precisa.
 *
 * # Por que estes testes existem
 *
 * A fatia anterior cobriu tudo o que dava sem DOM: filtro, papel, aritmética das
 * setas. O que ficou de fora era exatamente o que quebra sem avisar — foco
 * inicial, `aria-selected` andando com a seta, `Esc` fechando, `Enter`
 * navegando. Nada disso aparece em `typecheck`, e um `aria-activedescendant`
 * apontando para um id inexistente é invisível até alguém usar leitor de tela.
 */

const push = vi.fn()
const searchInvoicesAction = vi.fn()
const searchPatientsAction = vi.fn()
const searchAppointmentsAction = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

vi.mock('@/modules/patients/actions/searchPatients.action', () => ({
  searchPatientsAction: (input: unknown) => searchPatientsAction(input),
}))

vi.mock('@/modules/billing/actions/searchInvoices.action', () => ({
  searchInvoicesAction: (input: unknown) => searchInvoicesAction(input),
}))

vi.mock('@/modules/scheduling/actions/searchAppointments.action', () => ({
  searchAppointmentsAction: (input: unknown) => searchAppointmentsAction(input),
}))

beforeEach(() => {
  push.mockClear()
  searchInvoicesAction.mockReset()
  searchInvoicesAction.mockResolvedValue({ ok: true, data: [] })
  searchPatientsAction.mockReset()
  searchPatientsAction.mockResolvedValue({ ok: true, data: [] })
  searchAppointmentsAction.mockReset()
  searchAppointmentsAction.mockResolvedValue({ ok: true, data: [] })
})

/*
 * Limpeza explícita: a config não usa `globals: true`, então o `afterEach`
 * automático da Testing Library não se registra. Sem isto, cada teste
 * renderiza por cima do anterior e `getByRole` encontra dois de tudo.
 */
afterEach(cleanup)

function renderPalette(
  props: Partial<React.ComponentProps<typeof CommandPalette>> = {},
) {
  const onOpenChange = vi.fn()

  render(
    <CommandPalette
      open
      onOpenChange={onOpenChange}
      role="owner"
      {...props}
    />,
  )

  return { onOpenChange }
}

function input() {
  return screen.getByRole('combobox')
}

function options() {
  return screen.getAllByRole('option')
}

describe('renderização', () => {
  it('não monta nada quando fechada', () => {
    renderPalette({ open: false })

    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('abre com o campo já focado', () => {
    renderPalette()

    // Sem isto a pessoa aperta Ctrl+K e precisa clicar antes de digitar — o
    // atalho existiria para nada.
    expect(document.activeElement).toBe(input())
  })

  it('lista os comandos e agrupa', () => {
    renderPalette()

    expect(options().length).toBeGreaterThan(5)
    expect(screen.getByText('Criar')).toBeTruthy()
    expect(screen.getByText('Ir para')).toBeTruthy()
  })

  it('o primeiro item nasce selecionado', () => {
    renderPalette()

    expect(options()[0].getAttribute('aria-selected')).toBe('true')
  })

  it('`aria-activedescendant` aponta para um id que EXISTE', () => {
    renderPalette()

    const active = input().getAttribute('aria-activedescendant')

    /*
     * O elo que sustenta a acessibilidade da lista: e por ele que o leitor de
     * tela anuncia o item destacado sem o foco sair do campo. Apontar para um
     * id inexistente nao quebra nada visivelmente — so silencia o anuncio.
     */
    expect(active).toBeTruthy()
    expect(document.getElementById(active as string)).not.toBeNull()
  })
})

describe('filtragem', () => {
  it('reduz a lista conforme o texto', () => {
    renderPalette()

    const before = options().length
    fireEvent.change(input(), { target: { value: 'financeiro' } })

    expect(options().length).toBeLessThan(before)
    expect(screen.getByText('Financeiro')).toBeTruthy()
  })

  it('encontra por como a equipe chama a tela', () => {
    renderPalette()
    fireEvent.change(input(), { target: { value: 'fila' } })

    expect(screen.getByText('Atendimentos')).toBeTruthy()
  })

  it('ignora acento e caixa', () => {
    renderPalette()
    fireEvent.change(input(), { target: { value: 'PRONTUARIOS' } })

    expect(screen.getByText('Prontuários')).toBeTruthy()
  })

  it('oferece buscar paciente a partir de dois caracteres', () => {
    renderPalette()

    fireEvent.change(input(), { target: { value: 'm' } })
    expect(screen.queryByText(/Buscar pacientes por/)).toBeNull()

    fireEvent.change(input(), { target: { value: 'ma' } })
    expect(screen.getByText('Buscar pacientes por "ma"')).toBeTruthy()
  })
})

describe('busca inline de pacientes', () => {
  it('consulta pacientes reais e abre a ficha selecionada', async () => {
    searchPatientsAction.mockResolvedValue({
      ok: true,
      data: [{ id: 'patient-1', name: 'Maria Souza' }],
    })

    renderPalette()
    fireEvent.change(input(), { target: { value: 'Maria' } })

    const patient = await screen.findByRole('option', { name: 'Maria Souza' })
    expect(searchPatientsAction).toHaveBeenCalledWith({ query: 'Maria' })

    fireEvent.click(patient)
    expect(push).toHaveBeenCalledWith('/pacientes/patient-1')
  })

  it('consulta agendamentos reais e retorna para a agenda', async () => {
    searchAppointmentsAction.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'appointment-1',
          patientName: 'Maria Souza',
          professionalName: 'Dra. Ana',
          type: 'Consulta',
          startsAt: '2026-08-09T13:00:00.000Z',
          status: 'confirmed',
        },
      ],
    })

    renderPalette()
    fireEvent.change(input(), { target: { value: 'Maria' } })

    const appointment = await screen.findByRole('option', {
      name: /Maria Souza.*09\/08\/2026/,
    })
    expect(searchAppointmentsAction).toHaveBeenCalledWith({ query: 'Maria' })

    fireEvent.click(appointment)
    expect(push).toHaveBeenCalledWith('/agenda')
  })

  it('consulta cobranças reais e retorna para o financeiro', async () => {
    searchInvoicesAction.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'invoice-1',
          patientName: 'Maria Souza',
          totalCents: 12500,
          paidCents: 5000,
          status: 'partially_paid',
          createdAt: '2026-08-09T13:00:00.000Z',
        },
      ],
    })

    renderPalette()
    fireEvent.change(input(), { target: { value: 'Maria' } })

    const invoice = await screen.findByRole('option', {
      name: /Maria Souza.*R\$\s*125,00/,
    })
    expect(searchInvoicesAction).toHaveBeenCalledWith({ query: 'Maria' })

    fireEvent.click(invoice)
    expect(push).toHaveBeenCalledWith('/financeiro')
  })

  it('não consulta o banco no modo demonstração', async () => {
    renderPalette({ role: undefined })
    fireEvent.change(input(), { target: { value: 'Maria' } })

    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(searchPatientsAction).not.toHaveBeenCalled()
    expect(searchAppointmentsAction).not.toHaveBeenCalled()
    expect(searchInvoicesAction).not.toHaveBeenCalled()
    expect(screen.getByRole('option', { name: /buscar pacientes por/i })).toBeTruthy()
  })
})

describe('teclado', () => {
  it('a seta para baixo move a seleção', () => {
    renderPalette()

    expect(options()[0].getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(input(), { key: 'ArrowDown' })

    expect(options()[0].getAttribute('aria-selected')).toBe('false')
    expect(options()[1].getAttribute('aria-selected')).toBe('true')
  })

  it('a seta para cima dá a volta para o último', () => {
    renderPalette()
    fireEvent.keyDown(input(), { key: 'ArrowUp' })

    const items = options()
    expect(items[items.length - 1].getAttribute('aria-selected')).toBe('true')
  })

  it('Enter navega para o comando destacado', () => {
    renderPalette()

    fireEvent.change(input(), { target: { value: 'financeiro' } })
    fireEvent.keyDown(input(), { key: 'Enter' })

    expect(push).toHaveBeenCalledWith('/financeiro')
  })

  it('Enter na busca leva para a listagem com o termo na URL', () => {
    renderPalette()

    fireEvent.change(input(), { target: { value: 'maria' } })
    fireEvent.keyDown(input(), { key: 'Enter' })

    // `q`, e nao `search`: e o parametro que a rota le.
    expect(push).toHaveBeenCalledWith('/pacientes?q=maria')
  })

  it('Enter sem resultado nenhum não navega', () => {
    renderPalette({ role: null })

    fireEvent.change(input(), { target: { value: 'zzzzzzzz' } })
    fireEvent.keyDown(input(), { key: 'Enter' })

    expect(push).not.toHaveBeenCalled()
  })

  it('Escape fecha', () => {
    const { onOpenChange } = renderPalette()

    fireEvent.keyDown(input(), { key: 'Escape' })

    // Quem fecha e o Radix Dialog; o componente nao trata a tecla.
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('clique', () => {
  it('abre o comando clicado', () => {
    renderPalette()

    fireEvent.click(screen.getByText('Relatórios'))

    expect(push).toHaveBeenCalledWith('/relatorios')
  })

  it('fecha ao escolher', () => {
    const { onOpenChange } = renderPalette()

    fireEvent.click(screen.getByText('Relatórios'))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

describe('estado vazio', () => {
  it('avisa o que É e o que NÃO é pesquisável', () => {
    renderPalette({ role: null })
    fireEvent.change(input(), { target: { value: 'zzzzzzzz' } })

    expect(screen.getByText(/Nenhuma tela ou ação com esse nome/)).toBeTruthy()
    /*
     * A ressalva e o ponto: sem ela, quem digitasse o nome de um atendimento
     * leria "nenhum resultado" e concluiria que ele nao existe — quando ninguem
     * chegou a procurar.
     */
    expect(
      screen.getByText(/ainda não são pesquisados pelo nome/),
    ).toBeTruthy()
  })

  it('com menos de dois caracteres, ensina o mínimo', () => {
    renderPalette({ role: null })
    fireEvent.change(input(), { target: { value: 'z' } })

    expect(
      screen.getByText(/pelo menos dois caracteres/),
    ).toBeTruthy()
  })
})

describe('papel', () => {
  it('`finance` não recebe agenda nem prontuário', () => {
    renderPalette({ role: 'finance' })

    expect(screen.queryByText('Agenda')).toBeNull()
    expect(screen.queryByText('Prontuários')).toBeNull()
    expect(screen.getByText('Financeiro')).toBeTruthy()
  })

  it('sessão sem papel não recebe busca de paciente', () => {
    renderPalette({ role: null })
    fireEvent.change(input(), { target: { value: 'maria' } })

    expect(screen.queryByText(/Buscar pacientes por/)).toBeNull()
  })

  it('`receptionist` recebe a busca e a criação de paciente', () => {
    renderPalette({ role: 'receptionist' })
    fireEvent.change(input(), { target: { value: 'paciente' } })

    expect(screen.getByText('Novo paciente')).toBeTruthy()
  })
})

describe('useCommandPaletteShortcut', () => {
  function Harness() {
    const [count, setCount] = useState(0)
    useCommandPaletteShortcut(() => setCount((value) => value + 1))

    return <output>{count}</output>
  }

  it('abre com Ctrl+K e com Cmd+K', () => {
    render(<Harness />)

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByRole('status').textContent).toBe('1')

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByRole('status').textContent).toBe('2')
  })

  it('aceita K maiúsculo — o atalho vale com Shift ou Caps', () => {
    render(<Harness />)

    fireEvent.keyDown(window, { key: 'K', ctrlKey: true })

    expect(screen.getByRole('status').textContent).toBe('1')
  })

  it('não dispara com a tecla sozinha', () => {
    render(<Harness />)

    // Sem isto, digitar "k" em qualquer campo abriria a paleta.
    fireEvent.keyDown(window, { key: 'k' })

    expect(screen.getByRole('status').textContent).toBe('0')
  })

  it('não dispara com outra tecla + Ctrl', () => {
    render(<Harness />)

    fireEvent.keyDown(window, { key: 'j', ctrlKey: true })

    expect(screen.getByRole('status').textContent).toBe('0')
  })

  it('para de ouvir ao desmontar', () => {
    const { unmount } = render(<Harness />)

    unmount()
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })

    // Sem a limpeza do efeito, cada navegacao deixaria um ouvinte vivo.
    expect(screen.queryByRole('status')).toBeNull()
  })
})
