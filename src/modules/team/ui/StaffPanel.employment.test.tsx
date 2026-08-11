// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Admissão e desligamento na tela — feature **S-03**.
 *
 * Antes desta fatia o cadastro nascia ativo e **não havia caminho para desligar
 * ninguém**: a lista de funcionários só crescia, e o seletor de ausências
 * oferecia gente que já tinha saído da clínica.
 */

const EMPLOYEE = '5f2b1a3c-4d5e-4f60-8a71-9b2c3d4e5f60'
const OTHER = '9019956f-bdd8-4d61-868d-09b02332dad0'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const createEmployeeAction = vi.fn()
const terminateEmployeeAction = vi.fn()
const reinstateEmployeeAction = vi.fn()
const createTimeOffAction = vi.fn()
const answerTimeOffAction = vi.fn()

vi.mock('../actions/staff.action', () => ({
  createEmployeeAction: (input: unknown) => createEmployeeAction(input),
  terminateEmployeeAction: (input: unknown) => terminateEmployeeAction(input),
  reinstateEmployeeAction: (input: unknown) => reinstateEmployeeAction(input),
  createTimeOffAction: (input: unknown) => createTimeOffAction(input),
  answerTimeOffAction: (input: unknown) => answerTimeOffAction(input),
}))

const { StaffPanel } = await import('./StaffPanel')

type PanelProps = React.ComponentProps<typeof StaffPanel>
type EmployeeItem = PanelProps['employees'][number]

function employee(overrides: Partial<EmployeeItem> = {}): EmployeeItem {
  return {
    id: EMPLOYEE,
    fullName: 'Ana Ribeiro',
    roleTitle: 'Recepcionista',
    contractType: 'clt',
    isActive: true,
    hireDate: '2026-03-01',
    terminationDate: null,
    ...overrides,
  }
}

function renderPanel(overrides: Partial<PanelProps> = {}) {
  render(
    <StaffPanel
      employees={[employee()]}
      timeOff={[]}
      canManage
      isLive
      {...overrides}
    />,
  )
}

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  createEmployeeAction.mockResolvedValue({ ok: true, data: {} })
  terminateEmployeeAction.mockResolvedValue({ ok: true, data: {} })
  reinstateEmployeeAction.mockResolvedValue({ ok: true, data: {} })
})

describe('o período do vínculo aparece', () => {
  it('mostra a admissão quando ela existe', () => {
    renderPanel()

    expect(screen.getByText(/Admitido em 01\/03\/2026/)).toBeTruthy()
  })

  it('cadastro antigo sem admissão não ganha travessão', () => {
    /*
     * A base tem funcionários anteriores ao campo. Um "—" no lugar da data
     * pareceria campo obrigatório em branco.
     */
    renderPanel({ employees: [employee({ hireDate: null })] })

    expect(screen.queryByText(/Admitido em/)).toBeNull()
    expect(screen.queryByText(/Admissão não registrada/)).toBeNull()
  })

  it('desligado mostra as duas datas e o selo', () => {
    renderPanel({
      employees: [
        employee({ isActive: false, terminationDate: '2026-08-10' }),
      ],
    })

    expect(screen.getByText(/desligado em 10\/08\/2026/)).toBeTruthy()
    expect(screen.getByText('Desligado')).toBeTruthy()
  })
})

describe('registrar o desligamento', () => {
  it('o formulário abre com a data de hoje', () => {
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: /registrar desligamento/i }))

    const field = screen.getByLabelText(/data do desligamento/i) as unknown as
      HTMLInputElement
    const today = new Date()
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    // O desligamento é registrado no dia em que acontece.
    expect(field.value).toBe(expected)
  })

  it('o campo recusa data futura antes de o servidor precisar recusar', () => {
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: /registrar desligamento/i }))

    const field = screen.getByLabelText(/data do desligamento/i) as unknown as
      HTMLInputElement

    expect(field.getAttribute('max')).toBeTruthy()
    expect(field.getAttribute('max')).toBe(field.value)
  })

  it('envia o funcionário e a data escolhida', async () => {
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: /registrar desligamento/i }))
    fireEvent.change(screen.getByLabelText(/data do desligamento/i), {
      target: { value: '2026-08-10' },
    })
    fireEvent.click(screen.getByRole('button', { name: /confirmar desligamento/i }))

    await waitFor(() =>
      expect(terminateEmployeeAction).toHaveBeenCalledWith({
        employeeId: EMPLOYEE,
        terminationDate: '2026-08-10',
      }),
    )
  })

  it('a recusa do servidor aparece na tela', async () => {
    terminateEmployeeAction.mockResolvedValue({
      ok: false,
      error: { code: 'conflict', message: 'O desligamento não pode ser no futuro.' },
    })

    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: /registrar desligamento/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirmar desligamento/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/não pode ser no futuro/i),
    )
  })

  it('abrir o de outra pessoa fecha o anterior', () => {
    /*
     * A data digitada pertence ÀQUELE desligamento: mantê-la ao trocar de
     * pessoa registraria a saída de alguém com a data pensada para outro.
     */
    renderPanel({
      employees: [employee(), employee({ id: OTHER, fullName: 'Bruno Lima' })],
    })

    const buttons = screen.getAllByRole('button', { name: /registrar desligamento/i })
    fireEvent.click(buttons[0])
    expect(screen.getAllByLabelText(/data do desligamento/i)).toHaveLength(1)

    fireEvent.click(buttons[1])
    expect(screen.getAllByLabelText(/data do desligamento/i)).toHaveLength(1)
  })
})

describe('reverter', () => {
  it('só aparece para quem está desligado', () => {
    renderPanel()

    expect(screen.queryByRole('button', { name: /reverter/i })).toBeNull()
  })

  it('manda apenas o funcionário — a data volta a ser nula no servidor', async () => {
    renderPanel({
      employees: [employee({ isActive: false, terminationDate: '2026-08-10' })],
    })

    fireEvent.click(screen.getByRole('button', { name: /reverter/i }))

    await waitFor(() =>
      expect(reinstateEmployeeAction).toHaveBeenCalledWith({
        employeeId: EMPLOYEE,
      }),
    )
  })
})

describe('quem não gerencia, não desliga', () => {
  it('sem `team.manage` não há botão nenhum', () => {
    renderPanel({ canManage: false })

    expect(
      screen.queryByRole('button', { name: /registrar desligamento/i }),
    ).toBeNull()
  })

  it('em demonstração também não', () => {
    // A action recusaria por falta de sessão; um botão que sempre falha é pior
    // que botão ausente.
    renderPanel({ isLive: false })

    expect(
      screen.queryByRole('button', { name: /registrar desligamento/i }),
    ).toBeNull()
  })
})

describe('ausências', () => {
  it('funcionário desligado sai do seletor', () => {
    /*
     * Registrar férias de quem não trabalha mais ali é o tipo de dado que só
     * aparece errado meses depois, num questionamento trabalhista.
     */
    renderPanel({
      employees: [
        employee(),
        employee({
          id: OTHER,
          fullName: 'Bruno Lima',
          isActive: false,
          terminationDate: '2026-08-10',
        }),
      ],
    })

    fireEvent.click(screen.getByRole('button', { name: /registrar ausência/i }))

    const options = screen
      .getAllByRole('option')
      .map((option) => option.textContent)

    expect(options).toContain('Ana Ribeiro')
    expect(options).not.toContain('Bruno Lima')
  })
})

describe('admissão no cadastro', () => {
  it('viaja junto com o novo funcionário', async () => {
    renderPanel({ employees: [] })

    fireEvent.click(screen.getByRole('button', { name: /novo funcionário/i }))
    fireEvent.change(screen.getByLabelText(/nome completo/i), {
      target: { value: 'Carla Dias' },
    })
    fireEvent.change(screen.getByLabelText(/^admissão$/i), {
      target: { value: '2026-08-01' },
    })
    fireEvent.click(screen.getByRole('button', { name: /cadastrar/i }))

    await waitFor(() =>
      expect(createEmployeeAction).toHaveBeenCalledWith(
        expect.objectContaining({
          fullName: 'Carla Dias',
          hireDate: '2026-08-01',
        }),
      ),
    )
  })

  it('cadastrar sem admissão continua possível', async () => {
    // O balcão registra a contratação de ontem sem parar para procurar a data
    // exata do contrato.
    renderPanel({ employees: [] })

    fireEvent.click(screen.getByRole('button', { name: /novo funcionário/i }))
    fireEvent.change(screen.getByLabelText(/nome completo/i), {
      target: { value: 'Carla Dias' },
    })
    fireEvent.click(screen.getByRole('button', { name: /cadastrar/i }))

    await waitFor(() =>
      expect(createEmployeeAction).toHaveBeenCalledWith(
        expect.objectContaining({ hireDate: '' }),
      ),
    )
  })
})
