// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProfessionalDto } from '../schemas/professional.schema'
import { ProfessionalsPanel } from './ProfessionalsPanel'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const createProfessionalAction = vi.fn(async (input: unknown) => {
  void input
  return { ok: true as const, data: {} as ProfessionalDto }
})
const updateProfessionalAction = vi.fn(async (input: unknown) => {
  void input
  return { ok: true as const, data: {} as ProfessionalDto }
})
const setProfessionalActiveAction = vi.fn(async (input: unknown) => {
  void input
  return { ok: true as const, data: {} as ProfessionalDto }
})

vi.mock('../actions/professional.action', () => ({
  createProfessionalAction: (input: unknown) => createProfessionalAction(input),
  updateProfessionalAction: (input: unknown) => updateProfessionalAction(input),
  setProfessionalActiveAction: (input: unknown) => setProfessionalActiveAction(input),
}))

const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const OTHER_USER = 'a9b8c7d6-e5f4-4a3b-8c2d-1e0f9a8b7c6d'

function professional(overrides: Partial<ProfessionalDto> = {}): ProfessionalDto {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    displayName: 'Dra. Helena Alves',
    councilType: 'CRM',
    councilNumber: '12345',
    councilState: 'SP',
    council: 'CRM 12345/SP',
    specialties: ['Clínica geral'],
    defaultSlotMinutes: 30,
    isActive: true,
    linkedUserId: USER,
    canSign: true,
    ...overrides,
  }
}

const members = [
  { userId: USER, name: 'Helena Alves' },
  { userId: OTHER_USER, name: 'Bruno Dias' },
]

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof ProfessionalsPanel>> = {},
) {
  return render(
    <ProfessionalsPanel
      professionals={[professional()]}
      members={members}
      canManage
      isLive
      {...overrides}
    />,
  )
}

describe('lista', () => {
  it('mostra nome, conselho e especialidade', () => {
    renderPanel()

    expect(screen.getByText('Dra. Helena Alves')).toBeTruthy()
    expect(screen.getByText(/CRM 12345\/SP · Clínica geral/)).toBeTruthy()
  })

  it('sem conselho e sem especialidade, diz isso em vez de deixar em branco', () => {
    renderPanel({
      professionals: [
        professional({ council: null, specialties: [] }),
      ],
    })

    expect(screen.getByText(/sem conselho e sem especialidade/i)).toBeTruthy()
  })

  it('vazio explica o que trava sem profissional', () => {
    renderPanel({ professionals: [] })

    expect(screen.getByText(/nenhum profissional cadastrado/i)).toBeTruthy()
    expect(screen.getByText(/ninguém assina prontuário/i)).toBeTruthy()
  })
})

/**
 * Quem não tem usuário vinculado aparece na agenda e NÃO assina — porque
 * `current_professional_id()` resolve pelo usuário da sessão. Descobrir isso na
 * hora de fechar um atendimento é caro.
 */
describe('quem não assina é sinalizado', () => {
  it('sem usuário vinculado, avisa antes', () => {
    renderPanel({
      professionals: [professional({ linkedUserId: null, canSign: false })],
    })

    expect(screen.getByText(/não assina prontuário nem prescrição/i)).toBeTruthy()
  })

  it('quem assina não recebe aviso nenhum', () => {
    renderPanel()

    expect(screen.queryByText(/não assina prontuário/i)).toBeNull()
  })

  it('inativo diz que saiu da agenda', () => {
    renderPanel({
      professionals: [professional({ isActive: false, canSign: false })],
    })

    expect(screen.getByText(/fora da agenda e sem assinatura/i)).toBeTruthy()
  })
})

describe('cadastro', () => {
  it('manda os campos do formulário', async () => {
    renderPanel({ professionals: [] })

    fireEvent.click(screen.getByRole('button', { name: /novo profissional/i }))
    fireEvent.change(screen.getByLabelText('Nome na agenda'), {
      target: { value: 'Dr. Bruno Dias' },
    })
    fireEvent.change(screen.getByLabelText('Conselho'), { target: { value: 'CRO' } })
    fireEvent.change(screen.getByLabelText('Número'), { target: { value: '9876' } })
    fireEvent.change(screen.getByLabelText('UF do conselho'), { target: { value: 'RJ' } })
    fireEvent.change(screen.getByLabelText('Especialidades'), {
      target: { value: 'Ortodontia' },
    })
    fireEvent.click(screen.getByRole('button', { name: /salvar profissional/i }))

    await waitFor(() =>
      expect(createProfessionalAction).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Dr. Bruno Dias',
          councilType: 'CRO',
          councilNumber: '9876',
          councilState: 'RJ',
          specialties: 'Ortodontia',
          defaultSlotMinutes: '30',
          userId: '',
        }),
      ),
    )
  })

  it('editar abre o formulário já preenchido e manda o id', async () => {
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))

    expect((screen.getByLabelText('Nome na agenda') as HTMLInputElement).value).toBe(
      'Dra. Helena Alves',
    )

    fireEvent.click(screen.getByRole('button', { name: /salvar profissional/i }))

    await waitFor(() =>
      expect(updateProfessionalAction).toHaveBeenCalledWith(
        expect.objectContaining({ professionalId: professional().id }),
      ),
    )
    expect(createProfessionalAction).not.toHaveBeenCalled()
  })

  it('os nove conselhos do enum são oferecidos', () => {
    /*
     * O enum `council_type` do banco tinha oito valores inalcançáveis pela
     * aplicação inteira — só `CRM` chegava a algum lugar.
     */
    renderPanel({ professionals: [] })
    fireEvent.click(screen.getByRole('button', { name: /novo profissional/i }))

    const options = [...screen.getByLabelText('Conselho').querySelectorAll('option')].map(
      (option) => option.textContent,
    )

    expect(options).toEqual([
      'Sem conselho',
      'CRM',
      'CRO',
      'CRP',
      'CREFITO',
      'CRN',
      'CRF',
      'COREN',
      'CREF',
      'CRFa',
    ])
  })
})

describe('vínculo com usuário', () => {
  it('oferece só quem ainda não está vinculado a outro cadastro', () => {
    /*
     * O banco recusaria o segundo vínculo do mesmo usuário; oferecer um nome
     * que vai falhar é pior que não oferecê-lo.
     */
    // Helena já está vinculada ao profissional da lista; só Bruno sobra.
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /novo profissional/i }))

    const options = [
      ...screen.getByLabelText('Usuário vinculado').querySelectorAll('option'),
    ].map((option) => option.textContent)

    expect(options).toEqual(['Sem usuário vinculado', 'Bruno Dias'])
  })

  it('na edição, o próprio vínculo continua na lista', () => {
    // Sem isto, abrir a edição de quem já tem vínculo mostraria o campo vazio e
    // salvar apagaria a assinatura da pessoa.
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))

    const options = [
      ...screen.getByLabelText('Usuário vinculado').querySelectorAll('option'),
    ]

    expect(options.map((option) => option.textContent)).toContain('Helena Alves')
    expect(options.find((option) => option.selected)?.value).toBe(USER)
  })
})

describe('ativação', () => {
  it('desativar manda o inverso do estado atual', async () => {
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }))

    await waitFor(() =>
      expect(setProfessionalActiveAction).toHaveBeenCalledWith({
        professionalId: professional().id,
        isActive: false,
      }),
    )
  })

  it('inativo oferece reativar', async () => {
    renderPanel({ professionals: [professional({ isActive: false, canSign: false })] })

    fireEvent.click(screen.getByRole('button', { name: 'Reativar' }))

    await waitFor(() =>
      expect(setProfessionalActiveAction).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      ),
    )
  })

  it('não há botão de excluir', () => {
    /*
     * `medical_records.author_id` e `prescriptions.author_id` apontam para cá:
     * apagar o profissional apagaria a autoria de prontuário, que tem prazo
     * legal de guarda.
     */
    renderPanel()

    expect(screen.queryByRole('button', { name: /excluir|remover|apagar/i })).toBeNull()
  })
})

describe('permissão e falhas', () => {
  it('sem `team.manage`, nada de escrever', () => {
    renderPanel({ canManage: false })

    expect(screen.queryByRole('button', { name: /novo profissional/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Desativar' })).toBeNull()
  })

  it('a recusa do servidor aparece na tela', async () => {
    setProfessionalActiveAction.mockResolvedValue({
      ok: false,
      error: { code: 'forbidden', message: 'Falta policy de escrita.' },
    } as never)
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: 'Desativar' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('policy'))
  })

  it('falha de leitura aparece e bloqueia a escrita', () => {
    renderPanel({
      professionals: [],
      loadError: 'Não foi possível falar com o servidor agora.',
    })

    expect(screen.getByRole('alert').textContent).toContain('servidor')
    expect(
      screen.getByRole('button', { name: /novo profissional/i }).hasAttribute('disabled'),
    ).toBe(true)
  })

  it('modo demonstração não fabrica profissional', () => {
    renderPanel({ professionals: [], isLive: false })

    expect(screen.getByRole('status').textContent).toMatch(/modo demonstração/i)
    expect(
      screen.getByRole('button', { name: /novo profissional/i }).hasAttribute('disabled'),
    ).toBe(true)
  })
})

/**
 * `agenda_color` existe na tabela e nenhuma tela a lê — a agenda colore por
 * status do atendimento.
 */
describe('cor de agenda', () => {
  it('a ausência é explicada, e não omitida', () => {
    renderPanel()

    expect(screen.getByText(/a cor de agenda não é escolhida aqui/i)).toBeTruthy()
  })

  it('não há campo de cor', () => {
    renderPanel({ professionals: [] })
    fireEvent.click(screen.getByRole('button', { name: /novo profissional/i }))

    expect(screen.queryByLabelText(/cor/i)).toBeNull()
  })
})
