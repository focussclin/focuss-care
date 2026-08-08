import { describe, expect, it } from 'vitest'

import { createPayableSchema, settlePayableSchema } from './billing.schema'

describe('schema de contas a pagar', () => {
  it('converte valor e data para o contrato do domínio', () => {
    const result = createPayableSchema.parse({
      description: 'Aluguel',
      category: '',
      supplier: 'Imobiliária',
      amount: '1.250,00',
      dueDate: '2026-08-15',
      isRecurring: true,
      notes: '',
    })

    expect(result).toMatchObject({
      amount: 125000,
      dueDate: new Date(2026, 7, 15),
      category: null,
      notes: null,
    })
  })

  it('recusa vencimento inválido e valor vazio', () => {
    const result = createPayableSchema.safeParse({
      description: 'Aluguel',
      amount: '',
      dueDate: '2026-02-31',
      isRecurring: false,
    })

    expect(result.success).toBe(false)
  })

  it('exige método válido para a baixa', () => {
    expect(
      settlePayableSchema.safeParse({
        payableId: '9019956f-bdd8-4d61-868d-09b02332dad0',
        method: 'pix',
      }).success,
    ).toBe(true)
  })
})
