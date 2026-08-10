import type {
  NewPurchaseOrderData,
  NewPurchaseSupplierData,
  PurchaseCatalogItem,
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseSupplier,
  PurchaseSupplierUpdateData,
} from './Purchase'

export interface PurchaseRepository {
  listSuppliers(clinicId: string): Promise<PurchaseSupplier[]>
  listCatalog(clinicId: string): Promise<PurchaseCatalogItem[]>
  listOrders(clinicId: string): Promise<PurchaseOrder[]>
  createSupplier(
    clinicId: string,
    createdBy: string,
    data: NewPurchaseSupplierData,
  ): Promise<PurchaseSupplier>
  updateSupplier(
    clinicId: string,
    supplierId: string,
    data: PurchaseSupplierUpdateData,
  ): Promise<PurchaseSupplier>
  createOrder(
    clinicId: string,
    data: NewPurchaseOrderData,
  ): Promise<PurchaseOrder>
  transitionOrder(
    clinicId: string,
    orderId: string,
    status: PurchaseOrderStatus,
  ): Promise<PurchaseOrder>
  receiveOrderItem(
    clinicId: string,
    orderItemId: string,
    quantity: number,
  ): Promise<PurchaseOrder['items'][number]>
}
