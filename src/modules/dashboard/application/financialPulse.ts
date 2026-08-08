import { addDays } from '@/lib/utils/date'

export interface FinancialPulse {
  openCents: number
  overdueCents: number
  overdueCount: number
  dueSoonCents: number
  dueSoonCount: number
}

export interface FinancialPayableSnapshot {
  amountCents: number
  dueDate: Date
  status: 'open' | 'overdue' | 'paid'
}

/** Resume somente o que um dashboard pode exibir sem duplicar o Financeiro. */
export function buildFinancialPulse(
  payables: readonly FinancialPayableSnapshot[],
  today: Date,
): FinancialPulse {
  const dueSoonLimit = addDays(today, 7)

  return payables.reduce<FinancialPulse>(
    (pulse, payable) => {
      if (payable.status === 'paid') return pulse

      pulse.openCents += payable.amountCents

      if (payable.status === 'overdue') {
        pulse.overdueCents += payable.amountCents
        pulse.overdueCount += 1
        return pulse
      }

      if (payable.dueDate >= today && payable.dueDate <= dueSoonLimit) {
        pulse.dueSoonCents += payable.amountCents
        pulse.dueSoonCount += 1
      }

      return pulse
    },
    {
      openCents: 0,
      overdueCents: 0,
      overdueCount: 0,
      dueSoonCents: 0,
      dueSoonCount: 0,
    },
  )
}
