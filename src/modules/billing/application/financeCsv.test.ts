import { describe, expect, it } from 'vitest'

import { buildFinanceCsv } from './financeCsv'

describe('buildFinanceCsv', () => {
  it('exporta cobranças e contas a pagar reais em uma tabela única', () => {
    const csv = buildFinanceCsv({
      periodLabel: 'Mês corrente',
      invoices: [
        {
          id: 'invoice-1',
          patientName: 'Ana; Silva',
          number: 42,
          status: 'partially_paid',
          totalCents: 15000,
          paidCents: 5000,
          remainingCents: 10000,
          dueDate: '2026-08-20',
          createdAt: '2026-08-11T12:00:00.000Z',
          items: [
            {
              id: 'item-1',
              description: 'Consulta\nretorno',
              quantity: 1,
              unitPriceCents: 15000,
              totalCents: 15000,
            },
          ],
          payments: [
            {
              id: 'payment-1',
              amountCents: 5000,
              method: 'pix',
              paidAt: '2026-08-11T12:05:00.000Z',
              notes: null,
            },
          ],
        },
      ],
      payables: [
        {
          id: 'payable-1',
          description: 'Aluguel',
          category: 'Estrutura',
          supplier: 'Clínica Ltda.',
          amountCents: 80000,
          dueDate: '2026-08-15',
          paidAt: null,
          paidAmountCents: 0,
          method: null,
          isRecurring: true,
          status: 'open',
          notes: null,
        },
      ],
    })

    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('"periodo";"tipo";"referencia"')
    expect(csv).toContain('"Mês corrente";"Cobrança";"42"')
    expect(csv).toContain('"Ana; Silva"')
    expect(csv).toContain('"Consulta retorno"')
    expect(csv).toContain('"Mês corrente";"Conta a pagar";"payable-1"')
    expect(csv).toContain('"15000";"5000";"10000"')
    expect(csv).toContain('"80000";"0";"80000"')
  })

  it('não expõe campos fora do contrato financeiro', () => {
    const csv = buildFinanceCsv({
      periodLabel: 'Mês corrente',
      invoices: [],
      payables: [],
    })

    expect(csv).not.toContain('cpf')
    expect(csv).not.toContain('notes')
    expect(csv.split('\n')).toHaveLength(2)
  })
})
