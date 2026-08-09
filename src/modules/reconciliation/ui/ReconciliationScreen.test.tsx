// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BankAccountDto, BankTransactionDto, ReconciliationCandidateDto } from '../schemas/reconciliation.schema'
import { ReconciliationScreen } from './ReconciliationScreen'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const account: BankAccountDto = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Conta principal',
  bankName: 'Banco Focuss',
  lastFour: '1234',
  notes: null,
  isActive: true,
  updatedAt: '2026-08-09T10:00:00.000Z',
}

const transaction: BankTransactionDto = {
  id: '00000000-0000-4000-8000-000000000002',
  bankAccountId: account.id,
  bankAccountName: account.name,
  occurredOn: '2026-08-09',
  direction: 'credit',
  amountCents: 12500,
  description: 'Recebimento via PIX',
  externalId: 'pix-001',
  status: 'pending',
  notes: null,
  reconciliation: null,
}

const invoice: ReconciliationCandidateDto = {
  id: '00000000-0000-4000-8000-000000000003',
  label: 'Fatura · Maria Silva',
  amountCents: 12500,
  date: '2026-08-09',
  reference: null,
}

afterEach(cleanup)

function renderScreen(overrides: Partial<React.ComponentProps<typeof ReconciliationScreen>> = {}) {
  return render(
    <ReconciliationScreen
      accounts={[account]}
      transactions={[transaction]}
      invoiceCandidates={[invoice]}
      payableCandidates={[]}
      onSubmitAccount={vi.fn().mockResolvedValue(null)}
      onToggleAccount={vi.fn().mockResolvedValue(null)}
      onSubmitTransaction={vi.fn().mockResolvedValue(null)}
      onReconcile={vi.fn().mockResolvedValue(null)}
      isLive
      {...overrides}
    />,
  )
}

describe('ReconciliationScreen', () => {
  it('mostra transação pendente e conta sem fabricar saldo', () => {
    renderScreen()

    expect(screen.getByRole('heading', { name: 'Conciliação bancária' })).toBeTruthy()
    expect(screen.getByText('Recebimento via PIX')).toBeTruthy()
    expect(screen.getByText('Pendente')).toBeTruthy()
    expect(screen.getAllByText('R$ 125,00').length).toBeGreaterThan(0)
  })

  it('vincula uma entrada a uma fatura', async () => {
    const onReconcile = vi.fn().mockResolvedValue(null)
    renderScreen({ onReconcile })

    fireEvent.click(screen.getByRole('button', { name: /conciliar/i }))
    fireEvent.change(screen.getByLabelText('Fatura correspondente'), { target: { value: invoice.id } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar vínculo' }))

    await waitFor(() => expect(onReconcile).toHaveBeenCalledWith({
      transactionId: transaction.id,
      invoiceId: invoice.id,
      payableId: null,
      notes: '',
    }))
  })

  it('bloqueia mutações quando a migration está pendente', () => {
    renderScreen({ accounts: [], transactions: [], schemaPending: true })

    expect(screen.getByRole('status').textContent).toMatch(/migration/i)
    expect(screen.getByRole('button', { name: /nova conta/i }).hasAttribute('disabled')).toBe(true)
    expect(screen.getAllByRole('button', { name: /registrar transação/i }).every((button) => button.hasAttribute('disabled'))).toBe(true)
  })
})
