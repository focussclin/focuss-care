import { describe, expect, it } from 'vitest'

import { createInventoryItemSchema, recordInventoryMovementSchema } from './inventory.schema'

describe('inventory.schema', () => {
  it('normaliza SKU e permite estoque mínimo zero', () => {
    const result = createInventoryItemSchema.safeParse({
      name: 'Luvas',
      sku: ' luv-001 ',
      unit: 'caixa',
      minimumQuantity: 0,
      notes: '',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.sku).toBe('LUV-001')
    expect(result.data.notes).toBeNull()
  })

  it('recusa saída sem quantidade positiva', () => {
    const result = recordInventoryMovementSchema.safeParse({
      itemId: '00000000-0000-4000-8000-000000000001',
      movementType: 'out',
      quantity: 0,
      unitCostCents: null,
      reason: '',
    })

    expect(result.success).toBe(false)
  })
})
