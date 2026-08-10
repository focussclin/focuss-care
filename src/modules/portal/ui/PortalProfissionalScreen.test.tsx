// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { PortalProfissionalScreen } from './PortalProfissionalScreen'
import type { PortalProfissionalScreenProps } from './PortalProfissionalScreen.props'

/**
 * Os estados da tela — e os que ela precisa NÃO confundir.
 *
 * "Não há agenda" tem três causas muito diferentes neste produto, e tratá-las
 * como uma só é o que faz uma tela mentir:
 *
 *  - o dia está livre (lista vazia, legítima);
 *  - a pessoa não atende, então nunca terá agenda aqui (`no-professional`);
 *  - o banco não tem a tabela de tarefas (afeta só o painel lateral).
 *
 * O segundo é o que mais engana: um `admin` tem `appointment.read`, entra
 * legitimamente, e veria "nenhum atendimento hoje" — verdade sobre o número,
 * mentira sobre o motivo. E o motivo é o que diz o que fazer a seguir.
 */

afterEach(cleanup)

const base: PortalProfissionalScreenProps = {
  greetingName: 'Marina',
  dayLabel: 'segunda-feira, 10 de agosto',
  summary: { remaining: 0, finished: 0, openTasks: 0, overdueTasks: 0 },
  current: null,
  unclosed: [],
  upcoming: [],
  finished: [],
  tasks: [],
  noProfessional: false,
  tasksSchemaPending: false,
  isLive: true,
}

function appointment(
  overrides: Partial<PortalProfissionalScreenProps['upcoming'][number]> & {
    id: string
  },
) {
  return {
    patientId: `p-${overrides.id}`,
    patientName: 'Ana Souza',
    type: 'Consulta',
    timeLabel: '14:30',
    windowLabel: '14:30 – 15:00',
    durationMinutes: 30,
    statusLabel: 'Agendado',
    statusTone: 'pending' as const,
    startsAt: '2026-08-10T17:30:00.000Z',
    ...overrides,
  }
}

function renderScreen(overrides: Partial<PortalProfissionalScreenProps> = {}) {
  render(<PortalProfissionalScreen {...base} {...overrides} />)
}

describe('PortalProfissionalScreen', () => {
  it('sem cadastro de profissional, explica em vez de mostrar zero', () => {
    renderScreen({ noProfessional: true })

    expect(screen.getByText('Esta tela é de quem atende.')).toBeTruthy()
    expect(screen.getByText(/cadastro de profissional nesta clínica/i)).toBeTruthy()

    // E nenhum número: "0 atendimentos" seria a resposta errada para a pergunta.
    expect(screen.queryByText('Pela frente')).toBeNull()
  })

  it('sem cadastro de profissional, oferece o caminho de saída', () => {
    renderScreen({ noProfessional: true })

    const link = screen.getByRole('link', { name: 'Abrir Equipe' })

    expect(link.getAttribute('href')).toBe('/equipe')
  })

  it('dia livre é lista vazia, e não erro', () => {
    renderScreen()

    expect(
      screen.getByText('Nenhum atendimento marcado para hoje.'),
    ).toBeTruthy()
  })

  it('dia que já acabou diz que acabou, e não que estava vazio', () => {
    /*
     * "Nenhum atendimento marcado" às 19h, depois de oito consultas, seria a
     * tela contradizendo o dia de trabalho de quem está lendo.
     */
    renderScreen({
      summary: { ...base.summary, finished: 8 },
      finished: [appointment({ id: 'a', statusLabel: 'Concluído' })],
    })

    expect(screen.getByText('Nada mais marcado para hoje.')).toBeTruthy()
  })

  it('mostra o atendimento em curso com a janela inteira', () => {
    renderScreen({
      current: appointment({ id: 'agora', patientName: 'Joana Lima' }),
      summary: { ...base.summary, remaining: 1 },
    })

    expect(screen.getByText('Acontecendo agora')).toBeTruthy()
    expect(screen.getByText('14:30 – 15:00')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Joana Lima' })).toBeTruthy()
  })

  it('o não encerrado aparece, e diz o custo de ficar assim', () => {
    renderScreen({
      unclosed: [appointment({ id: 'manha', timeLabel: '08:00' })],
      summary: { ...base.summary, remaining: 1 },
    })

    expect(screen.getByText('Aguardando encerramento')).toBeTruthy()
    expect(screen.getByText(/não entram no faturamento/i)).toBeTruthy()
  })

  it('cancelado continua visível entre os encerrados', () => {
    /*
     * O profissional precisa saber que o horário das 14h vagou — e não apenas
     * que ele sumiu da lista. Mesmo motivo por que a agenda não apaga o
     * cancelado.
     */
    renderScreen({
      finished: [
        appointment({
          id: 'cancelado',
          statusLabel: 'Cancelado',
          statusTone: 'negative',
        }),
      ],
      summary: { ...base.summary, finished: 1 },
    })

    expect(screen.getByText('Já encerrados')).toBeTruthy()
    expect(screen.getByText('Cancelado')).toBeTruthy()
  })

  it('a pendência de tarefas não derruba a agenda', () => {
    /*
     * O ponto da separação: `clinic_tasks` não existe, e a agenda ao lado é
     * real. Derrubar a tela inteira trocaria uma ausência parcial por uma
     * total.
     */
    renderScreen({
      tasksSchemaPending: true,
      upcoming: [appointment({ id: 'a', patientName: 'Ana Souza' })],
      summary: { ...base.summary, remaining: 1 },
    })

    expect(screen.getByText(/clinic_tasks. não foi criada/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ana Souza' })).toBeTruthy()
  })

  it('sem tarefas atribuídas é vazio, e não pendência de schema', () => {
    renderScreen()

    expect(screen.getByText('Nenhuma tarefa atribuída a você.')).toBeTruthy()
    expect(screen.queryByText(/não foi criada no banco/i)).toBeNull()
  })

  it('destaca a tarefa vencida', () => {
    renderScreen({
      tasks: [
        {
          id: 't1',
          title: 'Assinar o laudo da Ana',
          dueLabel: 'venceu ontem',
          isOverdue: true,
          priority: 1,
          patientName: 'Ana Souza',
        },
      ],
      summary: { ...base.summary, openTasks: 1, overdueTasks: 1 },
    })

    const prazo = screen.getByText('venceu ontem')

    expect(prazo.className).toContain('text-danger')
  })

  it('o modo demonstração se declara em vez de inventar agenda', () => {
    renderScreen({ isLive: false })

    expect(screen.getByRole('status').textContent).toMatch(
      /modo demonstração/i,
    )
  })

  it('não oferece a agenda da clínica como se fosse esta tela', () => {
    // O link existe, e é secundário: quem entrou aqui quer o próprio dia.
    renderScreen()

    const link = screen.getByRole('link', { name: 'Ver a agenda da clínica' })

    expect(link.getAttribute('href')).toBe('/agenda')
  })
})
