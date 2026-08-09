import { describe, expect, it } from 'vitest'

import { createBankTransactionSchema, reconcileBankTransactionSchema } from './reconciliation.schema'

describe('reconciliation.schema', () => {
  it('converte data e valor da transação mantendo entrada ou saída explícita', () => {
    const result = createBankTransactionSchema.safeParse({
      bankAccountId: '00000000-0000-4000-8000-000000000001',
      occurredOn: '2026-08-09',
      direction: 'credit',
      amountCents: 12500,
      description: 'Recebimento via PIX',
      externalId: '',
      notes: '',
    })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.occurredOn).toBeInstanceOf(Date)
  })

  it('exige exatamente um alvo para conciliação', () => {
    const base = {
      transactionId: '00000000-0000-4000-8000-000000000001',
      notes: '',
    }

    expect(reconcileBankTransactionSchema.safeParse({ ...base, invoiceId: '', payableId: '' }).success).toBe(false)
    expect(reconcileBankTransactionSchema.safeParse({ ...base, invoiceId: '00000000-0000-4000-8000-000000000002', payableId: '00000000-0000-4000-8000-000000000003' }).success).toBe(false)
    expect(reconcileBankTransactionSchema.safeParse({ ...base, invoiceId: '00000000-0000-4000-8000-000000000002', payableId: '' }).success).toBe(true)
  })
})
