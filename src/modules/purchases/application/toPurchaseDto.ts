import type {
  PurchaseCatalogItemDto,
  PurchaseOrderDto,
  PurchaseSupplierDto,
} from '../schemas/purchase.schema'
import type {
  PurchaseCatalogItem,
  PurchaseOrder,
  PurchaseSupplier,
} from '../domain/Purchase'

export function toPurchaseSupplierDto(value: PurchaseSupplier): PurchaseSupplierDto {
  return {
    id: value.id,
    name: value.name,
    taxId: value.taxId,
    email: value.email,
    phone: value.phone,
    notes: value.notes,
    isActive: value.isActive,
    updatedAt: value.updatedAt.toISOString(),
  }
}

export function toPurchaseCatalogItemDto(value: PurchaseCatalogItem): PurchaseCatalogItemDto {
  return {
    id: value.id,
    name: value.name,
    unit: value.unit,
    currentQuantity: value.currentQuantity,
  }
}

export function toPurchaseOrderDto(value: PurchaseOrder): PurchaseOrderDto {
  return {
    id: value.id,
    supplier: value.supplier,
    status: value.status,
    expectedDeliveryDate: value.expectedDeliveryDate?.toISOString().slice(0, 10) ?? null,
    totalCents: value.totalCents,
    notes: value.notes,
    items: value.items.map((item) => ({ ...item })),
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  }
}
