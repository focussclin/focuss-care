// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { ActivityEntry } from '@/modules/_shared/domain/types'

import { RecentActivityCard } from './RecentActivityCard'

const now = new Date(2026, 7, 12, 10, 0)

function activity(index: number): ActivityEntry {
  return {
    id: `activity-${index}`,
    actorName: `Pessoa ${index}`,
    description: 'cadastrou um paciente.',
    occurredAt: new Date(2026, 7, 12, 9, 55 - index),
  }
}

afterEach(cleanup)

describe('RecentActivityCard', () => {
  it('limita o feed aos cinco itens que o contrato do dashboard promete', () => {
    render(
      <RecentActivityCard
        entries={Array.from({ length: 6 }, (_, index) => activity(index))}
        now={now}
      />,
    )

    expect(screen.getByText('Pessoa 0')).toBeTruthy()
    expect(screen.getByText('Pessoa 4')).toBeTruthy()
    expect(screen.queryByText('Pessoa 5')).toBeNull()
    expect(screen.getByRole('link', { name: /ver tudo/i }).getAttribute('href')).toBe(
      '/relatorios',
    )
  })

  it('não fabrica atividade quando o feed está vazio', () => {
    render(<RecentActivityCard entries={[]} now={now} />)

    expect(screen.getByText('Nenhuma atividade por aqui ainda.')).toBeTruthy()
    expect(screen.getByText('As movimentações da equipe aparecem nesta lista.')).toBeTruthy()
  })
})
