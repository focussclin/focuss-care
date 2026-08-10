// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AvailabilityExceptionDto } from '../schemas/availabilityException.schema'
import { AvailabilityExceptionsPanel } from './AvailabilityExceptionsPanel'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const PRO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const feriado: AvailabilityExceptionDto = {
  id: '11111111-1111-4111-8111-111111111111',
  professionalId: null,
  professionalName: null,
  kind: 'block',
  startsAt: '2026-12-25T03:00:00.000Z',
  endsAt: '2026-12-26T02:59:00.000Z',
  reason: 'Natal',
}

afterEach(cleanup)

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof AvailabilityExceptionsPanel>> = {},
) {
  return render(
    <AvailabilityExceptionsPanel
      exceptions={[feriado]}
      professionals={[{ id: PRO, name: 'Ana Costa' }]}
      onCreate={vi.fn().mockResolvedValue(null)}
      onRemove={vi.fn().mockResolvedValue(null)}
      canManage
      isLive
      {...overrides}
    />,
  )
}

describe('a lista diz quem fica sem agenda', () => {
  it('exceção sem profissional é a clínica inteira', () => {
    /*
     * A coluna é nullable no banco exatamente para isso, e a diferença muda
     * quem fica sem agenda: feriado fecha tudo, férias fecham uma pessoa.
     */
    renderPanel()

    expect(screen.getByText('Toda a clínica')).toBeTruthy()
    expect(screen.getByText('Bloqueio')).toBeTruthy()
  })

  it('exceção de profissional mostra o nome', () => {
    renderPanel({
      exceptions: [{ ...feriado, professionalId: PRO, professionalName: 'Ana Costa' }],
    })

    expect(screen.getByText('Ana Costa')).toBeTruthy()
  })

  it('horário extra não se confunde com bloqueio', () => {
    renderPanel({ exceptions: [{ ...feriado, kind: 'extra', reason: 'Mutirão' }] })

    expect(screen.getByText('Horário extra')).toBeTruthy()
    expect(screen.queryByText('Bloqueio')).toBeNull()
  })

  it('vazio explica que a agenda segue o expediente', () => {
    renderPanel({ exceptions: [] })

    expect(screen.getByText(/segue o horário de/i)).toBeTruthy()
  })
})

describe('criação', () => {
  it('envia a janela e o alvo escolhidos', async () => {
    const onCreate = vi.fn().mockResolvedValue(null)
    renderPanel({ onCreate })

    fireEvent.click(screen.getByRole('button', { name: /nova exceção/i }))
    fireEvent.change(screen.getByLabelText('Quem'), { target: { value: PRO } })
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-09-01T08:00' } })
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-09-01T12:00' } })
    fireEvent.change(screen.getByLabelText(/motivo/i), { target: { value: 'Congresso' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        professionalId: PRO,
        kind: 'block',
        startsAt: '2026-09-01T08:00',
        endsAt: '2026-09-01T12:00',
        reason: 'Congresso',
      }),
    )
  })

  it('sem escolher profissional, vai vazio — a clínica inteira', async () => {
    const onCreate = vi.fn().mockResolvedValue(null)
    renderPanel({ onCreate })

    fireEvent.click(screen.getByRole('button', { name: /nova exceção/i }))
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-12-25T00:00' } })
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-12-25T23:59' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ professionalId: '' })),
    )
  })

  it('janela invertida nem chega ao servidor', async () => {
    const onCreate = vi.fn().mockResolvedValue(null)
    renderPanel({ onCreate })

    fireEvent.click(screen.getByRole('button', { name: /nova exceção/i }))
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-09-01T12:00' } })
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-09-01T08:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/depois do início/i))
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('bloquear avisa que não move atendimento', () => {
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: /nova exceção/i }))

    expect(screen.getByText(/não move atendimento/i)).toBeTruthy()
  })

  it('a recusa do servidor aparece dentro do modal', async () => {
    /*
     * O modal fica aberto para a pessoa corrigir, e o Radix marca o resto do
     * documento com `aria-hidden` — mensagem no nível da página ficaria atrás
     * do overlay.
     */
    const onCreate = vi.fn().mockResolvedValue('Há atendimentos marcados dentro desta janela.')
    renderPanel({ onCreate })

    fireEvent.click(screen.getByRole('button', { name: /nova exceção/i }))
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-09-01T08:00' } })
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-09-01T12:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/atendimentos marcados/i),
    )
  })
})

describe('remoção', () => {
  it('remove a exceção escolhida', async () => {
    const onRemove = vi.fn().mockResolvedValue(null)
    renderPanel({ onRemove })

    fireEvent.click(screen.getByRole('button', { name: /remover/i }))

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(feriado.id))
  })

  it('a recusa aparece na página', async () => {
    const onRemove = vi.fn().mockResolvedValue('Falta policy de escrita.')
    renderPanel({ onRemove })

    fireEvent.click(screen.getByRole('button', { name: /remover/i }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('policy'))
  })
})

describe('permissão e falhas', () => {
  it('sem `appointment.write`, nada de escrever', () => {
    renderPanel({ canManage: false })

    expect(screen.queryByRole('button', { name: /remover/i })).toBeNull()
    expect(screen.getByRole('button', { name: /nova exceção/i }).hasAttribute('disabled')).toBe(true)
  })

  it('modo demonstração não fabrica bloqueio', () => {
    renderPanel({ exceptions: [], isLive: false })

    expect(screen.getByText(/modo demonstração/i)).toBeTruthy()
  })

  it('falha de leitura aparece e bloqueia a escrita', () => {
    // Lista vazia por erro não pode parecer "nenhum bloqueio cadastrado".
    renderPanel({ exceptions: [], loadError: 'Não foi possível falar com o servidor agora.' })

    expect(screen.getByRole('alert').textContent).toContain('servidor')
    expect(screen.queryByText(/segue o horário de/i)).toBeNull()
    expect(screen.getByRole('button', { name: /nova exceção/i }).hasAttribute('disabled')).toBe(true)
  })
})
