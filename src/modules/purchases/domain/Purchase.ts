export const PURCHASE_ORDER_STATUSES = [
  'draft',
  'requested',
  'approved',
  'ordered',
  'partially_received',
  'received',
  'cancelled',
] as const

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number]

/**
 * Para onde cada estado pode ir — o espelho da função do banco.
 *
 * # Por que isto existe aqui, se o banco já decide
 *
 * Porque a tela precisa saber **antes** de oferecer o botão. Sem esta tabela, a
 * interface escreveu a própria versão das regras num mapa de rótulos, e ela
 * ficou linear: `draft → requested → approved → ordered`. O banco permite mais
 * do que isso, e o que sobrou de fora não era enfeite:
 *
 *  - `requested → draft` é **devolver para ajuste** — o pedido que chegou para
 *    aprovação com a quantidade errada;
 *  - `approved → requested` é **retirar a aprovação**, quando alguém aprovou o
 *    pedido errado.
 *
 * Sem os dois, a única saída de um pedido com problema era cancelar e refazer —
 * perdendo o histórico de quem pediu o quê.
 *
 * # A cópia é deliberada, e o teste é o que a mantém honesta
 *
 * Duas fontes para a mesma regra divergem. O que impede aqui: o banco continua
 * sendo quem decide (`purchase_order_transition_invalid`), esta tabela só
 * decide o que **mostrar**, e `Purchase.test.ts` compara as duas listas
 * contra o SQL. Se elas discordarem, a tela oferece um botão que sempre falha —
 * e é isso que o teste recusa.
 */
export const PURCHASE_ORDER_TRANSITIONS: Record<
  PurchaseOrderStatus,
  readonly PurchaseOrderStatus[]
> = {
  draft: ['requested', 'cancelled'],
  requested: ['draft', 'approved', 'cancelled'],
  approved: ['requested', 'ordered', 'cancelled'],
  /*
   * `ordered` só sai por cancelamento — ou pelo RECEBIMENTO, que não passa por
   * aqui. `partially_received` e `received` são escritos pela função de
   * recebimento, a partir da soma das quantidades, e não por alguém escolhendo
   * na tela: o estado do pedido é consequência do que chegou na porta.
   */
  ordered: ['cancelled'],
  partially_received: [],
  received: [],
  cancelled: [],
}

/** O pedido pode ir de `from` para `to`? */
export function canTransition(
  from: PurchaseOrderStatus,
  to: PurchaseOrderStatus,
): boolean {
  return PURCHASE_ORDER_TRANSITIONS[from].includes(to)
}

/**
 * Estados que ainda pedem alguma coisa de alguém.
 *
 * Recebido e cancelado saem: o primeiro porque chegou, o segundo porque não
 * vai chegar. Os dois contam diferente no painel, e nenhum deles é trabalho
 * aberto.
 */
export function isOpenOrder(status: PurchaseOrderStatus): boolean {
  return status !== 'received' && status !== 'cancelled'
}

export interface PurchaseSupplier {
  id: string
  name: string
  taxId: string | null
  email: string | null
  phone: string | null
  notes: string | null
  isActive: boolean
  updatedAt: Date
}

export interface PurchaseCatalogItem {
  id: string
  name: string
  unit: string
  currentQuantity: number
}

export interface PurchaseOrderItem {
  id: string
  inventoryItemId: string
  inventoryItemName: string
  inventoryItemUnit: string
  quantity: number
  unitCostCents: number
  receivedQuantity: number
}

export interface PurchaseOrder {
  id: string
  supplier: { id: string; name: string }
  status: PurchaseOrderStatus
  expectedDeliveryDate: Date | null
  totalCents: number
  notes: string | null
  items: readonly PurchaseOrderItem[]
  createdAt: Date
  updatedAt: Date
}

export interface NewPurchaseSupplierData {
  name: string
  taxId: string | null
  email: string | null
  phone: string | null
  notes: string | null
}

export type PurchaseSupplierUpdateData = Partial<NewPurchaseSupplierData> & {
  isActive?: boolean
}

export interface NewPurchaseOrderItemData {
  inventoryItemId: string
  quantity: number
  unitCostCents: number
}

export interface NewPurchaseOrderData {
  supplierId: string
  expectedDeliveryDate: Date | null
  notes: string | null
  items: readonly NewPurchaseOrderItemData[]
}
