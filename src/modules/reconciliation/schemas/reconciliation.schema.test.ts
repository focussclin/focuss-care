import { describe, expect, it } from 'vitest'

import { createBankTransactionSchema, reconcileBankTransactionSchema, setBankTransactionStatusSchema } from './reconciliation.schema'

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

describe('setBankTransactionStatusSchema', () => {
  const base = { transactionId: '00000000-0000-4000-8000-000000000002', from: 'pending', to: 'ignored' }

  it('aceita a troca que a tela oferece', () => {
    expect(setBankTransactionStatusSchema.safeParse(base).success).toBe(true)
  })

  it('exige o estado de origem, que vai para o WHERE do UPDATE', () => {
    /*
     * Sem `from`, o UPDATE não teria como recusar a troca de uma transação que
     * outra pessoa conciliou nesse intervalo — o vínculo continuaria gravado
     * apontando para uma transação que nega ter sido conciliada.
     */
    const { from: _omitido, ...semOrigem } = base
    void _omitido

    expect(setBankTransactionStatusSchema.safeParse(semOrigem).success).toBe(false)
  })

  it('recusa status fora do enum do banco', () => {
    expect(setBankTransactionStatusSchema.safeParse({ ...base, to: 'divergente' }).success).toBe(false)
  })

  it('não carrega valor, data nem descrição', () => {
    // O extrato é evidência: o que a tela pode mexer é só o status.
    const parsed = setBankTransactionStatusSchema.parse({ ...base, amountCents: 999, description: 'outro' })

    expect(Object.keys(parsed).sort()).toEqual(['from', 'to', 'transactionId'].sort())
  })
})
