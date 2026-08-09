// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LeadDto } from '../schemas/lead.schema'
import { LeadsScreen } from './LeadsScreen'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const leads: LeadDto[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Maria Silva',
    phone: '11900000000',
    email: 'maria@example.com',
    source: 'Instagram',
    campaign: 'Avaliação',
    interest: 'Dermatologia',
    stage: 'new',
    potentialValueCents: 45000,
    nextActionAt: '2026-08-10T23:59:59.999Z',
    notes: 'Quer atendimento à tarde.',
    assignedTo: { id: '22222222-2222-4222-8222-222222222222', name: 'Ana Costa' },
    convertedPatientId: null,
    createdAt: '2026-08-09T10:00:00.000Z',
    updatedAt: '2026-08-09T10:00:00.000Z',
  },
]

afterEach(cleanup)

function renderScreen(overrides: Partial<React.ComponentProps<typeof LeadsScreen>> = {}) {
  return render(
    <LeadsScreen
      leads={leads}
      assignees={[{ id: '22222222-2222-4222-8222-222222222222', name: 'Ana Costa' }]}
      onSubmit={vi.fn().mockResolvedValue(null)}
      onMove={vi.fn().mockResolvedValue(null)}
      isLive
      {...overrides}
    />,
  )
}

describe('LeadsScreen', () => {
  it('renderiza o pipeline e os dados essenciais do lead', () => {
    renderScreen()

    expect(screen.getByRole('heading', { name: 'CRM e Leads' })).toBeTruthy()
    expect(screen.getByText('Maria Silva')).toBeTruthy()
    expect(screen.getByText('R$ 450,00')).toBeTruthy()
    expect(screen.getByText('Instagram')).toBeTruthy()
  })

  it('filtra por busca sem alterar o conjunto original', () => {
    renderScreen()

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'telefone inexistente' } })

    expect(screen.getByText('Nenhum lead com esses filtros.')).toBeTruthy()
    expect(screen.queryByText('Maria Silva')).toBeNull()
  })

  it('não oferece gravação enquanto a migration está pendente', () => {
    renderScreen({ leads: [], schemaPending: true })

    expect(screen.getByRole('status').textContent).toMatch(/migration/i)
    expect(screen.getByRole('button', { name: /novo lead/i }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: /cadastrar primeiro lead/i }).hasAttribute('disabled')).toBe(true)
  })

  it('envia a criação e move um lead pelo seletor do cartão', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null)
    const onMove = vi.fn().mockResolvedValue(null)
    renderScreen({ leads: [], onSubmit, onMove })

    fireEvent.click(screen.getByRole('button', { name: /novo lead/i }))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '  João Lima ' } })
    fireEvent.change(screen.getByLabelText('Origem'), { target: { value: 'Indicação' } })
    fireEvent.change(screen.getByLabelText('Valor potencial (R$)'), { target: { value: '120.50' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar lead/i }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'João Lima',
          source: 'Indicação',
          potentialValueCents: 12050,
          stage: 'new',
        }),
        null,
      ),
    )

    cleanup()
    renderScreen({ onMove })
    fireEvent.change(screen.getByLabelText('Mover Maria Silva'), { target: { value: 'contacted' } })

    await waitFor(() => expect(onMove).toHaveBeenCalledWith(leads[0].id, 'contacted'))
  })
})
