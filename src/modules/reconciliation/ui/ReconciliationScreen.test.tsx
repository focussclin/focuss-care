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
      onChangeStatus={vi.fn().mockResolvedValue(null)}
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

/**
 * A fila precisa poder esvaziar.
 *
 * Tarifa, transferência entre contas da própria clínica e estorno duplicado
 * nunca vão casar com fatura ou despesa. O filtro "Ignoradas" já existia na
 * tela — mas não havia nenhuma forma de uma transação chegar a esse estado, o
 * que fazia dele um filtro que só devolvia lista vazia.
 */
describe('ignorar e devolver para a fila', () => {
  it('pendente oferece ignorar, e manda o estado que a tela viu', async () => {
    const onChangeStatus = vi.fn().mockResolvedValue(null)
    renderScreen({ onChangeStatus })

    fireEvent.click(screen.getByRole('button', { name: /ignorar/i }))

    // `from` vai para o WHERE do UPDATE: é o que recusa a troca se alguém
    // conciliou nesse intervalo.
    await waitFor(() => expect(onChangeStatus).toHaveBeenCalledWith(transaction.id, 'pending', 'ignored'))
  })

  it('ignorada oferece voltar para a fila', async () => {
    const onChangeStatus = vi.fn().mockResolvedValue(null)
    renderScreen({ transactions: [{ ...transaction, status: 'ignored' }], onChangeStatus })

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'ignored' } })
    fireEvent.click(screen.getByRole('button', { name: /voltar para a fila/i }))

    await waitFor(() => expect(onChangeStatus).toHaveBeenCalledWith(transaction.id, 'ignored', 'pending'))
  })

  it('conciliada não oferece nenhuma troca manual', () => {
    /*
     * Ignorar uma transação já conciliada deixaria a linha de
     * `bank_reconciliations` de pé, apontando para uma transação que afirma não
     * ter sido conciliada — e o vínculo não tem DELETE para desfazer.
     */
    renderScreen({ transactions: [{ ...transaction, status: 'reconciled', reconciliation: { id: 'r1', invoiceId: invoice.id, payableId: null, matchedAmountCents: 12500, notes: null } }] })

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'reconciled' } })

    expect(screen.queryByRole('button', { name: /ignorar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /voltar para a fila/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^conciliar$/i })).toBeNull()
  })

  it('sem permissão de escrita, nenhuma troca é oferecida', () => {
    renderScreen({ isLive: false })

    expect(screen.queryByRole('button', { name: /ignorar/i })).toBeNull()
  })
})

describe('evidência do vínculo', () => {
  it('a transação conciliada mostra com o que casou e por quanto', () => {
    /*
     * O vínculo já vinha do banco no mesmo SELECT e era descartado: a linha
     * conciliada mostrava um selo verde e mais nada. Como a conciliação não tem
     * UPDATE nem DELETE, é justamente o dado que mais precisa ser conferível.
     */
    renderScreen({
      transactions: [{ ...transaction, status: 'reconciled', reconciliation: { id: 'r1', invoiceId: invoice.id, payableId: null, matchedAmountCents: 12500, notes: 'Confere com o extrato' } }],
    })

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'reconciled' } })

    expect(screen.getByText(/Casada com fatura/)).toBeTruthy()
    expect(screen.getByText(/Confere com o extrato/)).toBeTruthy()
  })
})

/**
 * O schema não tem status `divergente`, e inventar um seria mentir sobre o que
 * está gravado. A divergência é derivada de dois valores reais e serve para
 * avisar ANTES — o vínculo grava o valor cheio da transação e não se desfaz.
 */
describe('aviso de divergência', () => {
  const outraFatura: ReconciliationCandidateDto = { ...invoice, id: '00000000-0000-4000-8000-000000000009', label: 'Fatura · João', amountCents: 9000 }

  it('avisa quando o valor do registro difere do extrato', () => {
    renderScreen({ invoiceCandidates: [invoice, outraFatura] })

    fireEvent.click(screen.getByRole('button', { name: /conciliar/i }))
    fireEvent.change(screen.getByLabelText('Fatura correspondente'), { target: { value: outraFatura.id } })

    expect(screen.getByText(/Divergência de R\$ 35,00/)).toBeTruthy()
    expect(screen.getByText(/valor CHEIO da transação/)).toBeTruthy()
  })

  it('valores iguais não disparam aviso', () => {
    renderScreen({ invoiceCandidates: [invoice, outraFatura] })

    fireEvent.click(screen.getByRole('button', { name: /conciliar/i }))
    fireEvent.change(screen.getByLabelText('Fatura correspondente'), { target: { value: invoice.id } })

    expect(screen.queryByText(/Divergência/)).toBeNull()
  })

  it('sem alvo escolhido não há divergência a mostrar', () => {
    renderScreen()

    fireEvent.click(screen.getByRole('button', { name: /conciliar/i }))

    expect(screen.queryByText(/Divergência/)).toBeNull()
  })
})
