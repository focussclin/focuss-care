// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FormsScreen } from './FormsScreen'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

afterEach(cleanup)

describe('FormsScreen', () => {
  it('declara o modo demo e não fabrica formulários', () => {
    render(
      <FormsScreen
        forms={[]}
        onSubmit={vi.fn()}
        onSetStatus={vi.fn()}
        isLive={false}
      />,
    )

    expect(screen.getByText('Nenhum formulário criado')).toBeTruthy()
    expect(screen.getByText(/modo demonstração/i)).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: /novo formulário/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('monta um campo e envia o modelo ao salvar', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null)

    render(
      <FormsScreen
        forms={[]}
        onSubmit={onSubmit}
        onSetStatus={vi.fn()}
        isLive
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /novo formulário/i }))
    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Pré-atendimento' },
    })
    fireEvent.click(screen.getByRole('button', { name: /adicionar campo/i }))
    fireEvent.change(screen.getByLabelText('Rótulo do campo'), {
      target: { value: 'Nome completo' },
    })
    fireEvent.click(screen.getByRole('button', { name: /salvar formulário/i }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Pré-atendimento',
        fields: [expect.objectContaining({ label: 'Nome completo', type: 'text' })],
      }),
      null,
    )
  })

  it('permite arquivar um formulário publicado', async () => {
    const onSetStatus = vi.fn().mockResolvedValue(null)

    render(
      <FormsScreen
        forms={[
          {
            id: '00000000-0000-4000-8000-000000000001',
            name: 'Anamnese',
            description: null,
            type: 'anamnesis',
            status: 'published',
            fields: [
              {
                id: 'field-1',
                label: 'Observações',
                type: 'textarea',
                required: false,
                helpText: null,
                options: [],
              },
            ],
            version: 1,
            createdAt: '2026-08-09T10:00:00.000Z',
            updatedAt: '2026-08-09T10:00:00.000Z',
          },
        ]}
        onSubmit={vi.fn()}
        onSetStatus={onSetStatus}
        isLive
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /arquivar/i }))

    expect(onSetStatus).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
      'archived',
    )
  })
})
