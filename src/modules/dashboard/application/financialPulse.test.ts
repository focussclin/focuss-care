import { describe, expect, it } from 'vitest'

import { buildFinancialPulse } from './financialPulse'

describe('pulso financeiro do dashboard', () => {
  it('separa abertas, vencidas e os próximos sete dias', () => {
    const today = new Date(2026, 7, 8)

    expect(
      buildFinancialPulse(
        [
          { amountCents: 1000, dueDate: new Date(2026, 7, 7), status: 'overdue' },
          { amountCents: 2000, dueDate: new Date(2026, 7, 10), status: 'open' },
          { amountCents: 3000, dueDate: new Date(2026, 7, 15), status: 'open' },
          { amountCents: 4000, dueDate: new Date(2026, 7, 1), status: 'paid' },
        ],
        today,
      ),
    ).toEqual({
      openCents: 6000,
      overdueCents: 1000,
      overdueCount: 1,
      dueSoonCents: 5000,
      dueSoonCount: 2,
    })
  })

  it('não transforma uma clínica sem despesas em saldo fictício', () => {
    expect(buildFinancialPulse([], new Date(2026, 7, 8))).toEqual({
      openCents: 0,
      overdueCents: 0,
      overdueCount: 0,
      dueSoonCents: 0,
      dueSoonCount: 0,
    })
  })
})
