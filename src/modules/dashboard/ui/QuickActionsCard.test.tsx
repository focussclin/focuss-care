// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { QuickActionsCard } from './QuickActionsCard'

afterEach(cleanup)

describe('QuickActionsCard', () => {
  it('mantém os três atalhos ligados a rotas funcionais', () => {
    render(<QuickActionsCard />)

    expect(screen.getByRole('link', { name: /cadastrar paciente/i }).getAttribute('href')).toBe(
      '/pacientes?novo=1',
    )
    expect(screen.getByRole('link', { name: /agendar atendimento/i }).getAttribute('href')).toBe(
      '/agenda?novo=1',
    )
    expect(screen.getByRole('link', { name: /convidar profissional/i }).getAttribute('href')).toBe(
      '/equipe',
    )
  })
})
