export const INVENTORY_MOVEMENT_TYPES = ['in', 'out'] as const
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number]

export interface InventoryItem {
  id: string
  name: string
  sku: string | null
  unit: string
  minimumQuantity: number
  currentQuantity: number
  notes: string | null
  isActive: boolean
  updatedAt: Date
}

export interface InventoryMovement {
  id: string
  itemId: string
  movementType: InventoryMovementType
  quantity: number
  unitCostCents: number | null
  /**
   * O que foi contado na prateleira, quando o movimento veio de um ajuste.
   *
   * `null` em entrada e saída comuns. É o que separa "saíram 3 no atendimento"
   * de "contei e faltavam 3" — duas linhas idênticas no extrato sem esta
   * coluna, e a segunda é a única que responde quanto a clínica perde por
   * quebra ou vencimento.
   */
  countedQuantity: number | null
  reason: string | null
  createdAt: Date
}

export interface NewInventoryItemData {
  name: string
  sku: string | null
  unit: string
  minimumQuantity: number
  notes: string | null
}

export type InventoryItemUpdateData = Partial<NewInventoryItemData> & {
  isActive?: boolean
}

export interface NewInventoryMovementData {
  itemId: string
  movementType: InventoryMovementType
  quantity: number
  unitCostCents: number | null
  reason: string | null
}

/** Contagem de inventário: o saldo apurado, não a diferença. */
export interface InventoryCountData {
  itemId: string
  countedQuantity: number
  reason: string | null
}

export const STOCK_LEVELS = [
  'inactive',
  'out-of-stock',
  'below-minimum',
  'healthy',
] as const
export type StockLevel = (typeof STOCK_LEVELS)[number]

type StockFacts = Pick<
  InventoryItem,
  'isActive' | 'currentQuantity' | 'minimumQuantity'
>

/**
 * A situação do saldo, em um lugar só.
 *
 * A regra vivia duplicada na tela — uma cópia no KPI, outra no selo do cartão —
 * e as duas diziam `currentQuantity <= minimumQuantity`. Como `minimum_quantity`
 * nasce `0` por padrão no banco, todo item recém-cadastrado, ainda sem nenhuma
 * entrada, aparecia em vermelho como "abaixo do mínimo": `0 <= 0`. O alerta
 * disparava justamente onde não havia mínimo definido para violar, e um painel
 * que sempre acusa vermelho é um painel que ninguém olha.
 *
 * Item sem saldo continua pedindo atenção — mas por "sem saldo", que é
 * verdade, e não por um mínimo que ninguém configurou.
 */
export function stockLevelOf(item: StockFacts): StockLevel {
  if (!item.isActive) return 'inactive'
  if (item.currentQuantity === 0) return 'out-of-stock'
  if (item.minimumQuantity > 0 && item.currentQuantity <= item.minimumQuantity) {
    return 'below-minimum'
  }
  return 'healthy'
}

/** Item ativo que precisa de reposição — sem saldo ou no limite do mínimo. */
export function needsRestock(item: StockFacts): boolean {
  const level = stockLevelOf(item)
  return level === 'out-of-stock' || level === 'below-minimum'
}
