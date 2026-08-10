import { describe, expect, it } from 'vitest'

import { createPurchaseOrderSchema, createPurchaseSupplierSchema } from './purchase.schema'

describe('purchase.schema', () => {
  it('normaliza fornecedor e converte a previsão para Date', () => {
    const result = createPurchaseSupplierSchema.safeParse({
      name: '  Distribuidora Saúde  ',
      taxId: '',
      email: 'CONTATO@EXAMPLE.COM',
      phone: '',
      notes: '',
    })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toMatchObject({ name: 'Distribuidora Saúde', email: 'contato@example.com', taxId: null })

    const order = createPurchaseOrderSchema.safeParse({
      supplierId: '00000000-0000-4000-8000-000000000001',
      expectedDeliveryDate: '2026-08-20',
      notes: '',
      items: [{ inventoryItemId: '00000000-0000-4000-8000-000000000002', quantity: 2, unitCostCents: 1250 }],
    })

    expect(order.success).toBe(true)
    if (order.success) expect(order.data.expectedDeliveryDate).toBeInstanceOf(Date)
  })

  it('recusa linhas duplicadas e quantidade inválida', () => {
    const result = createPurchaseOrderSchema.safeParse({
      supplierId: '00000000-0000-4000-8000-000000000001',
      expectedDeliveryDate: '',
      notes: '',
      items: [
        { inventoryItemId: '00000000-0000-4000-8000-000000000002', quantity: 0, unitCostCents: 100 },
        { inventoryItemId: '00000000-0000-4000-8000-000000000002', quantity: 1, unitCostCents: 100 },
      ],
    })

    expect(result.success).toBe(false)
  })
})
