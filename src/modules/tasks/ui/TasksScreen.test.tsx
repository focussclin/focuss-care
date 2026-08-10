// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { TaskGroupDto, TaskDto } from '../schemas/task.schema'
import { TasksScreen } from './TasksScreen'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const openTask: TaskDto = {
  id: 'task-1',
  title: 'Ligar para confirmar o retorno',
  notes: 'Verificar disponibilidade na próxima semana.',
  status: 'pending',
  priority: 1,
  dueLabel: 'vence hoje',
  dueAt: '2026-08-09T23:59:59.999Z',
  assignee: { id: 'user-1', name: 'Ana Costa' },
  target: { label: 'Maria Silva', href: '/pacientes/patient-1' },
}

const doneTask: TaskDto = {
  ...openTask,
  id: 'task-2',
  title: 'Enviar comprovante',
  status: 'done',
  dueLabel: 'venceu ontem',
}

const groups: TaskGroupDto[] = [
  { bucket: 'today', tasks: [openTask] },
  { bucket: 'overdue', tasks: [doneTask] },
]

afterEach(cleanup)

function renderScreen(overrides: Partial<React.ComponentProps<typeof TasksScreen>> = {}) {
  return render(
    <TasksScreen
      groups={groups}
      assignees={[{ id: 'user-1', name: 'Ana Costa' }]}
      patients={[{ id: 'patient-1', name: 'Maria Silva' }]}
      currentUserId="user-1"
      onSubmit={vi.fn().mockResolvedValue(null)}
      onToggleDone={vi.fn().mockResolvedValue(null)}
      onCancel={vi.fn().mockResolvedValue(null)}
      isLive
      {...overrides}
    />,
  )
}

describe('TasksScreen', () => {
  it('prioriza tarefas abertas e deixa concluídas no filtro próprio', () => {
    renderScreen()

    expect(screen.getByRole('heading', { name: 'Hoje' })).toBeTruthy()
    expect(screen.getByText('Ligar para confirmar o retorno')).toBeTruthy()
    expect(screen.queryByText('Enviar comprovante')).toBeNull()

    fireEvent.change(screen.getByLabelText('Situação'), {
      target: { value: 'done' },
    })

    expect(screen.getByText('Enviar comprovante')).toBeTruthy()
    expect(screen.queryByText('Ligar para confirmar o retorno')).toBeNull()
  })

  it('não oferece gravação enquanto a migration está pendente', () => {
    renderScreen({ groups: [], schemaPending: true })

    expect(screen.getByRole('status').textContent).toMatch(/migration/i)
    expect(screen.getByRole('button', { name: /nova tarefa/i }).hasAttribute('disabled')).toBe(true)
  })

  it('envia uma nova tarefa com os campos normalizados pela tela', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null)
    renderScreen({ groups: [], onSubmit })

    fireEvent.click(screen.getByRole('button', { name: /nova tarefa/i }))
    fireEvent.change(screen.getByLabelText('O que precisa ser feito'), {
      target: { value: '  Confirmar paciente  ' },
    })
    fireEvent.change(screen.getByLabelText('Detalhes'), {
      target: { value: 'Enviar mensagem pela manhã.' },
    })
    fireEvent.change(screen.getAllByLabelText('Responsável')[1], {
      target: { value: 'user-1' },
    })
    fireEvent.change(screen.getAllByLabelText('Prazo')[1], {
      target: { value: '2026-08-10' },
    })
    fireEvent.change(screen.getByLabelText('Relacionado a'), {
      target: { value: 'patient-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: /salvar tarefa/i }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        {
          title: 'Confirmar paciente',
          notes: 'Enviar mensagem pela manhã.',
          assigneeId: 'user-1',
          dueAt: '2026-08-10',
          priority: 3,
          patientId: 'patient-1',
        },
        null,
      ),
    )
  })

  it('conclui com a caixa de seleção e confirma o cancelamento', async () => {
    const onToggleDone = vi.fn().mockResolvedValue(null)
    const onCancel = vi.fn().mockResolvedValue(null)
    renderScreen({ onToggleDone, onCancel })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Concluir: Ligar para confirmar o retorno' }))
    await waitFor(() => expect(onToggleDone).toHaveBeenCalledWith('task-1', true))

    fireEvent.click(screen.getByRole('button', { name: /cancelar$/i }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /cancelar tarefa/i }))
    await waitFor(() => expect(onCancel).toHaveBeenCalledWith('task-1'))
  })
})

/**
 * A LIGAÇÃO entre os seletores e o recorte.
 *
 * A regra em si vive em `application/filterTasks` e tem 20 testes lá — as
 * combinações são baratas de cobrir quando não passam pelo DOM. O que só esta
 * camada pode garantir é que mexer no `<select>` chega até a função, e que os
 * dois vazios continuam distintos.
 */
describe('filtros', () => {
  it('mudar a situação troca o que aparece', () => {
    renderScreen()

    // A tela abre em "Abertas": a concluída não está visível.
    expect(screen.queryByText('Enviar comprovante')).toBeNull()

    fireEvent.change(screen.getByLabelText('Situação'), {
      target: { value: 'done' },
    })

    expect(screen.getByText('Enviar comprovante')).toBeTruthy()
    expect(screen.queryByText(openTask.title)).toBeNull()
  })

  it('"Minhas" só existe quando há sessão', () => {
    /*
     * Sem `currentUserId`, "minhas" não teria com o que comparar e devolveria
     * lista vazia sempre — um filtro que só sabe dizer "nada" é pior que um
     * filtro ausente.
     */
    renderScreen({ currentUserId: null })

    const responsavel = screen.getByLabelText('Responsável')

    expect(responsavel.textContent).not.toMatch(/minhas/i)
  })

  it('vazio POR FILTRO é diferente de vazio por não haver tarefa', () => {
    /*
     * Dois vazios com ações opostas: um convida a criar, o outro a afrouxar o
     * recorte. É o que `hasActiveFilters` decide, e é a razão de o padrão dos
     * filtros morar numa constante só.
     */
    renderScreen()

    fireEvent.change(screen.getByLabelText('Prazo'), {
      target: { value: 'overdue' },
    })

    expect(screen.getByText(/nenhuma tarefa com esses filtros/i)).toBeTruthy()
  })

  it('sem tarefa nenhuma, a tela convida a criar em vez de culpar o filtro', () => {
    renderScreen({ groups: [] })

    expect(screen.queryByText(/nenhuma tarefa com esses filtros/i)).toBeNull()
  })

  it('limpar filtros volta ao recorte inicial', () => {
    renderScreen()

    fireEvent.change(screen.getByLabelText('Situação'), {
      target: { value: 'done' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: /limpar filtros/i })[0])

    // De volta a "Abertas": a aberta reaparece e a concluída some.
    expect(screen.getByText(openTask.title)).toBeTruthy()
    expect(screen.queryByText('Enviar comprovante')).toBeNull()
  })
})
