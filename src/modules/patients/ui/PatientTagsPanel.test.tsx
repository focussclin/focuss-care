// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PatientTagsPanel } from './PatientTagsPanel'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

afterEach(cleanup)

const patientId = '00000000-0000-4000-8000-000000000001'

describe('PatientTagsPanel', () => {
  it('explica o modo demo e desabilita escrita sem banco', () => {
    render(
      <PatientTagsPanel
        patientId={patientId}
        tags={[]}
        isLive={false}
        canManage
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    expect(screen.getByRole('status').textContent).toMatch(/modo demonstra/i)
    expect(
      (screen.getByRole('button', { name: /adicionar/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('envia o nome e a cor escolhidos ao adicionar uma tag', () => {
    const onAdd = vi.fn().mockResolvedValue(null)

    render(
      <PatientTagsPanel
        patientId={patientId}
        tags={[]}
        isLive
        canManage
        onAdd={onAdd}
        onRemove={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Nova tag'), {
      target: { value: 'Retorno' },
    })
    fireEvent.change(screen.getByLabelText('Cor'), {
      target: { value: 'green' },
    })
    fireEvent.click(screen.getByRole('button', { name: /adicionar/i }))

    expect(onAdd).toHaveBeenCalledWith('Retorno', 'green')
  })

  it('envia o id correto ao remover uma tag existente', () => {
    const onRemove = vi.fn().mockResolvedValue(null)
    const tagId = '00000000-0000-4000-8000-000000000002'

    render(
      <PatientTagsPanel
        patientId={patientId}
        tags={[{ id: tagId, name: 'Retorno', color: 'blue' }]}
        isLive
        canManage
        onAdd={vi.fn()}
        onRemove={onRemove}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remover tag Retorno' }))

    expect(onRemove).toHaveBeenCalledWith(tagId)
  })
})
