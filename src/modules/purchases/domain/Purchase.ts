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
