import type {
  NewPurchaseOrderData,
  NewPurchaseSupplierData,
  PurchaseCatalogItem,
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseSupplier,
  PurchaseSupplierUpdateData,
} from '../domain/Purchase'
import type { PurchaseRepository } from '../domain/PurchaseRepository'
import { PurchaseRepositoryError } from '../domain/PurchaseRepositoryError'

/** Demonstração vazia: não inventa fornecedores, pedidos ou saldo. */
export class MockPurchaseRepository implements PurchaseRepository {
  async listSuppliers(_clinicId: string): Promise<PurchaseSupplier[]> {
    void _clinicId
    return []
  }

  async listCatalog(_clinicId: string): Promise<PurchaseCatalogItem[]> {
    void _clinicId
    return []
  }

  async listOrders(_clinicId: string): Promise<PurchaseOrder[]> {
    void _clinicId
    return []
  }

  async createSupplier(
    _clinicId: string,
    _createdBy: string,
    _data: NewPurchaseSupplierData,
  ): Promise<PurchaseSupplier> {
    void _clinicId
    void _createdBy
    void _data
    throw unavailable()
  }

  async updateSupplier(
    _clinicId: string,
    _supplierId: string,
    _data: PurchaseSupplierUpdateData,
  ): Promise<PurchaseSupplier> {
    void _clinicId
    void _supplierId
    void _data
    throw unavailable()
  }

  async createOrder(
    _clinicId: string,
    _data: NewPurchaseOrderData,
  ): Promise<PurchaseOrder> {
    void _clinicId
    void _data
    throw unavailable()
  }

  async transitionOrder(
    _clinicId: string,
    _orderId: string,
    _status: PurchaseOrderStatus,
  ): Promise<PurchaseOrder> {
    void _clinicId
    void _orderId
    void _status
    throw unavailable()
  }

  async receiveOrderItem(
    _clinicId: string,
    _orderItemId: string,
    _quantity: number,
  ): Promise<PurchaseOrder['items'][number]> {
    void _clinicId
    void _orderItemId
    void _quantity
    throw unavailable()
  }
}

function unavailable(): PurchaseRepositoryError {
  return new PurchaseRepositoryError('unavailable', 'compras indisponíveis no modo demo')
}
