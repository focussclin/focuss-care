// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Appointment } from '@/modules/_shared/domain/types'

import {
  AppointmentDetailsModal,
  type AppointmentDetailsModalProps,
} from './AppointmentDetailsModal'

/**
 * Cancelar atendimento é irreversível — e falhava em silêncio.
 *
 * # O defeito que estes testes prendem
 *
 * O modal recebia `cancelError` para mostrar a recusa do servidor, e tinha até
 * um comentário dizendo por quê: "sem isto o modal fecharia em silêncio e o
 * atendimento continuaria marcado, sem ninguém saber por quê".
 *
 * A prop **nunca renderizava**. O botão de confirmar chamava `onCancel(...)` —
 * uma promessa — e logo em seguida `onOpenChange(false)`, sem esperar. A tela
 * zerava `selected`, o modal desmontava, e a resposta do servidor chegava para
 * um componente que não existia mais.
 *
 * O desfecho na clínica é o que importa: a agenda continua igual, a pessoa sai
 * convencida de que cancelou, e ou o paciente aparece num horário que ninguém
 * esperava mais, ou o horário fica preso sem ninguém saber.
 *
 * Por isso os testes abaixo verificam AUSÊNCIA de fechamento, e não presença de
 * mensagem: o defeito não era a mensagem errada, era o modal sumir antes dela.
 */

afterEach(cleanup)

const appointment: Appointment = {
  id: '00000000-0000-4000-8000-000000000001',
  patientId: '00000000-0000-4000-8000-000000000002',
  patientName: 'Ana Souza',
  professionalId: '00000000-0000-4000-8000-000000000003',
  professionalName: 'Dra. Marina',
  type: 'Consulta',
  status: 'scheduled',
  startsAt: new Date('2026-08-12T13:00:00.000Z'),
  durationMinutes: 30,
}

function renderModal(overrides: Partial<AppointmentDetailsModalProps> = {}) {
  const props = {
    appointment,
    onOpenChange: vi.fn(),
    onReschedule: vi.fn(),
    onCancel: vi.fn(),
    confirmingCancel: false,
    onConfirmingCancelChange: vi.fn(),
    // A-03: obrigatórias de propósito. Um modal que perde as transições porque
    // o chamador esqueceu é o defeito que este arquivo inteiro existe para pegar.
    onConfirm: vi.fn(),
    onRecordOutcome: vi.fn(),
    ...overrides,
  } satisfies AppointmentDetailsModalProps

  render(<AppointmentDetailsModal {...props} />)

  return props
}

describe('AppointmentDetailsModal', () => {
  it('não cancela em um clique: o primeiro botão só pede confirmação', () => {
    const props = renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar atendimento' }))

    expect(props.onCancel).not.toHaveBeenCalled()
    expect(props.onConfirmingCancelChange).toHaveBeenCalledWith(true)
  })

  it('confirmar chama o cancelamento e NÃO fecha o modal', () => {
    /*
     * O coração da correção. Fechar aqui era o que tornava `cancelError`
     * inalcançável — quem fecha é a tela, e só depois de o servidor confirmar.
     */
    const props = renderModal({ confirmingCancel: true })

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar atendimento' }))

    expect(props.onCancel).toHaveBeenCalledWith(appointment)
    expect(props.onOpenChange).not.toHaveBeenCalled()
  })

  it('mostra a recusa do servidor com role="alert"', () => {
    renderModal({
      confirmingCancel: true,
      cancelError: 'Você não tem permissão para cancelar este atendimento.',
    })

    expect(screen.getByRole('alert').textContent).toContain(
      'Você não tem permissão para cancelar este atendimento.',
    )
  })

  it('separa o aviso do passo (status) da recusa do servidor (alert)', () => {
    /*
     * Os dois já foram `role="alert"` ao mesmo tempo. O leitor de tela
     * interrompia duas vezes seguidas, e a segunda — a recusa, que é a que
     * muda o que a pessoa precisa fazer — chegava como se fosse repetição.
     */
    renderModal({ confirmingCancel: true, cancelError: 'Horário já encerrado.' })

    expect(screen.getByRole('status').textContent).toMatch(
      /não pode ser desfeita/i,
    )
    expect(screen.getByRole('alert').textContent).toBe('Horário já encerrado.')
  })

  it('a recusa convive com o atendimento ainda visível', () => {
    /*
     * O erro sozinho não bastaria: a pessoa precisa ver, ao lado da mensagem,
     * QUAL atendimento continua marcado. Modal fechado com um aviso solto em
     * outro canto da tela seria a mesma dúvida com outra roupa.
     */
    renderModal({ confirmingCancel: true, cancelError: 'Horário já encerrado.' })

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('Ana Souza')).toBeTruthy()
  })

  it('durante o cancelamento trava os dois botões e avisa', () => {
    renderModal({ confirmingCancel: true, isCanceling: true })

    const cancelar = screen.getByRole('button', {
      name: 'Cancelando…',
    }) as HTMLButtonElement
    const manter = screen.getByRole('button', {
      name: 'Manter atendimento',
    }) as HTMLButtonElement

    expect(cancelar.disabled).toBe(true)
    expect(manter.disabled).toBe(true)
  })

  it('não deixa fechar no meio do cancelamento', () => {
    /*
     * Fechar com Esc enquanto a action está em voo devolveria o mesmo silêncio
     * que esta correção existe para eliminar.
     */
    const props = renderModal({ confirmingCancel: true, isCanceling: true })

    fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' })

    expect(props.onOpenChange).not.toHaveBeenCalled()
  })

  it('desistir volta ao passo anterior sem cancelar nada', () => {
    const props = renderModal({ confirmingCancel: true })

    fireEvent.click(screen.getByRole('button', { name: 'Manter atendimento' }))

    expect(props.onCancel).not.toHaveBeenCalled()
    expect(props.onConfirmingCancelChange).toHaveBeenCalledWith(false)
  })

  it('sem atendimento selecionado não renderiza nada', () => {
    renderModal({ appointment: null })

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('mostra a sala quando o atendimento tem uma', () => {
    /*
     * Este é o lugar que sustenta a decisão da grade semanal: lá o bloco de 30
     * minutos não tem altura para uma quarta linha, e a omissão só se justifica
     * porque quem precisa da sala abre o atendimento. Se aqui não aparecesse, a
     * informação não existiria em canto nenhum.
     */
    renderModal({
      appointment: { ...appointment, roomName: 'Consultório 1' },
    })

    expect(screen.getByText('Sala')).toBeTruthy()
    expect(screen.getByText('Consultório 1')).toBeTruthy()
  })

  it('sem sala não mostra a linha — nem escrita "sem sala"', () => {
    // O vínculo é opcional, e a maioria dos atendimentos não tem sala. Um
    // rótulo de ausência seria ruído sobre o caso normal.
    renderModal()

    expect(screen.queryByText('Sala')).toBeNull()
  })
})

/**
 * Ciclo de vida — feature **A-03**.
 *
 * O módulo sabia escrever UM status depois da criação: `canceled`. As transições
 * abaixo são o que faz `completed` e `no_show` existirem — e sem elas a taxa de
 * comparecimento de `/indicadores` fica nula para sempre.
 *
 * O relógio é fixado porque o desfecho depende dele: `outcomeIsDue` compara o
 * horário marcado com `new Date()`, e um teste que passasse hoje e falhasse em
 * 2027 seria pior que teste nenhum.
 */
describe('situação do atendimento (A-03)', () => {
  const DEPOIS = new Date('2026-08-12T14:00:00.000Z')
  const ANTES = new Date('2026-08-12T09:00:00.000Z')

  afterEach(() => vi.useRealTimers())

  function at(instant: Date) {
    vi.useFakeTimers()
    vi.setSystemTime(instant)
  }

  it('agendado oferece confirmar', () => {
    at(ANTES)
    const props = renderModal()

    fireEvent.click(screen.getByRole('button', { name: /confirmar presença/i }))

    expect(props.onConfirm).toHaveBeenCalledWith(appointment)
  })

  it('já confirmado não oferece confirmar de novo', () => {
    // Não é erro do usuário: é clique sem efeito.
    at(ANTES)
    renderModal({ appointment: { ...appointment, status: 'confirmed' } })

    expect(screen.queryByRole('button', { name: /confirmar presença/i })).toBeNull()
  })

  it('antes do horário, o desfecho não aparece — e a tela diz por quê', () => {
    /*
     * Botão desabilitado sem explicação faz a pessoa clicar de novo. A frase
     * também conta o que a recepção quer saber: falta devolve o horário.
     */
    at(ANTES)
    renderModal({ appointment: { ...appointment, status: 'confirmed' } })

    expect(screen.queryByRole('button', { name: 'Compareceu' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Faltou' })).toBeNull()
    expect(screen.getByText(/a partir do horário marcado/i)).toBeTruthy()
  })

  it('depois do horário, os dois desfechos aparecem', () => {
    at(DEPOIS)
    const props = renderModal({ appointment: { ...appointment, status: 'confirmed' } })

    fireEvent.click(screen.getByRole('button', { name: 'Faltou' }))

    expect(props.onRecordOutcome).toHaveBeenCalledWith(
      { ...appointment, status: 'confirmed' },
      'no_show',
    )
  })

  it('comparecimento manda `completed`', () => {
    at(DEPOIS)
    const props = renderModal({ appointment: { ...appointment, status: 'confirmed' } })

    fireEvent.click(screen.getByRole('button', { name: 'Compareceu' }))

    expect(props.onRecordOutcome).toHaveBeenCalledWith(
      { ...appointment, status: 'confirmed' },
      'completed',
    )
  })

  it.each(['completed', 'canceled', 'no_show'] as const)(
    '%s é terminal: a seção de situação some',
    (status) => {
      // Reabrir um terminal reescreveria o que a clínica afirmou ter acontecido.
      at(DEPOIS)
      renderModal({ appointment: { ...appointment, status } })

      expect(screen.queryByLabelText('Situação do atendimento')).toBeNull()
    },
  )

  it('a recusa do servidor fica ao lado dos botões de situação', () => {
    /*
     * Prop separada de `cancelError` de propósito: uma só faria a recusa de
     * "registrar falta" surgir sob o texto que fala em cancelar.
     */
    at(DEPOIS)
    renderModal({
      appointment: { ...appointment, status: 'confirmed' },
      lifecycleError: 'Este atendimento já está como "Cancelado".',
    })

    expect(screen.getByRole('alert').textContent).toContain('Cancelado')
  })

  it('transição em voo trava os botões', () => {
    at(DEPOIS)
    renderModal({
      appointment: { ...appointment, status: 'confirmed' },
      isUpdatingLifecycle: true,
    })

    const faltou = screen.getByRole('button', { name: 'Faltou' }) as HTMLButtonElement
    expect(faltou.disabled).toBe(true)
  })
})
