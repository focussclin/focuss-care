import type {
  PurchaseCatalogItemDto,
  PurchaseOrderDto,
  PurchaseOrderFormValues,
  PurchaseOrderStatus,
  PurchaseSupplierDto,
  PurchaseSupplierFormValues,
} from '../schemas/purchase.schema'

export interface PurchasesScreenProps {
  suppliers: readonly PurchaseSupplierDto[]
  catalog: readonly PurchaseCatalogItemDto[]
  orders: readonly PurchaseOrderDto[]
  onSubmitSupplier: (
    values: PurchaseSupplierFormValues,
    supplierId: string | null,
  ) => Promise<string | null>
  onToggleSupplier: (supplierId: string, isActive: boolean) => Promise<string | null>
  onSubmitOrder: (values: PurchaseOrderFormValues) => Promise<string | null>
  onTransitionOrder: (
    orderId: string,
    status: PurchaseOrderStatus,
  ) => Promise<string | null>
  onReceiveOrderItem: (orderItemId: string, quantity: number) => Promise<string | null>
  isLive: boolean
  schemaPending?: boolean
}
