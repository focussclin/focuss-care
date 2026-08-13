// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { FinancialPulse } from '../application/financialPulse'
import { FinancialPulseCard } from './FinancialPulseCard'

afterEach(cleanup)

const pulse: FinancialPulse = {
  openCents: 125000,
  overdueCents: 25000,
  overdueCount: 2,
  dueSoonCents: 60000,
  dueSoonCount: 3,
}

describe('FinancialPulseCard', () => {
  it('exibe valores formatados e a quantidade de contas vencidas', () => {
    render(<FinancialPulseCard pulse={pulse} />)

    expect(screen.getByText('R$ 1.250,00')).toBeTruthy()
    expect(screen.getByText('R$ 250,00')).toBeTruthy()
    expect(screen.getByText('R$ 600,00')).toBeTruthy()
    expect(screen.getByText('2 contas')).toBeTruthy()
    expect(screen.getByText('3 vencimentos')).toBeTruthy()
  })

  it('mantém o link para o financeiro real', () => {
    render(<FinancialPulseCard pulse={pulse} />)

    expect(
      screen.getByRole('link', { name: /abrir financeiro/i }).getAttribute('href'),
    ).toBe('/financeiro')
  })
})
