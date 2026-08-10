import { describe, expect, it } from 'vitest'

import { createInventoryItemSchema, recordInventoryMovementSchema, setInventoryQuantitySchema } from './inventory.schema'

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

/**
 * A contagem aceita zero; a movimentação não.
 *
 * Não é inconsistência: movimentar nada não é movimentar, mas contar uma
 * prateleira vazia é o resultado mais comum de um item que acabou. Recusar o
 * zero obrigaria a pessoa a registrar uma saída com a diferença calculada de
 * cabeça — exatamente o cálculo que a função do banco existe para fazer sozinha,
 * e sob lock.
 */
describe('setInventoryQuantitySchema', () => {
  const base = { itemId: '9019956f-bdd8-4d61-868d-09b02332dad0', countedQuantity: 4, reason: '' }

  it('aceita zero', () => {
    const parsed = setInventoryQuantitySchema.parse({ ...base, countedQuantity: 0 })

    expect(parsed.countedQuantity).toBe(0)
  })

  it('recusa contagem negativa', () => {
    expect(setInventoryQuantitySchema.safeParse({ ...base, countedQuantity: -1 }).success).toBe(false)
  })

  it('recusa contagem fracionada', () => {
    // Meia luva não existe; o banco guarda `integer`.
    expect(setInventoryQuantitySchema.safeParse({ ...base, countedQuantity: 2.5 }).success).toBe(false)
  })

  it('motivo vazio vira null, e não string vazia', () => {
    // `nullif(trim(p_reason), '')` no banco faria o mesmo; mandar '' seria
    // depender de a função limpar o que a aplicação sujou.
    expect(setInventoryQuantitySchema.parse(base).reason).toBeNull()
  })

  it('não aceita quantidade nem tipo de movimento — a direção é do banco', () => {
    /*
     * Se a tela pudesse mandar 'in'/'out' junto, ela estaria decidindo o sinal
     * do ajuste a partir de um saldo que leu antes — a corrida que
     * `set_inventory_quantity` evita.
     */
    const parsed = setInventoryQuantitySchema.parse({ ...base, movementType: 'in', quantity: 99 })

    expect(parsed).not.toHaveProperty('movementType')
    expect(parsed).not.toHaveProperty('quantity')
  })

  it('exige o item por uuid', () => {
    expect(setInventoryQuantitySchema.safeParse({ ...base, itemId: 'nao-uuid' }).success).toBe(false)
  })
})
