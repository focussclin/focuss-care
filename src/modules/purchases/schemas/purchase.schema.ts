import { z } from 'zod'

import type { PurchaseOrderStatus } from '../domain/Purchase'

export type { PurchaseOrderStatus } from '../domain/Purchase'

export const purchaseMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  nameRequired: 'Informe o nome do fornecedor.',
  nameTooLong: 'Use no máximo 140 caracteres.',
  taxIdTooLong: 'Use no máximo 40 caracteres.',
  emailInvalid: 'Digite um e-mail válido.',
  emailTooLong: 'Use no máximo 254 caracteres.',
  phoneTooLong: 'Use no máximo 30 caracteres.',
  notesTooLong: 'Use no máximo 1000 caracteres.',
  supplierInvalid: 'Escolha um fornecedor ativo.',
  itemInvalid: 'Escolha um item ativo do estoque.',
  quantityInvalid: 'A quantidade deve ser um inteiro maior que zero.',
  costInvalid: 'Informe um custo unitário válido em centavos.',
  duplicateItems: 'Cada item só pode aparecer uma vez no pedido.',
  orderWithoutItems: 'Adicione pelo menos um item ao pedido.',
  dateInvalid: 'Informe uma data válida.',
  statusInvalid: 'Esta mudança de status não é válida.',
  receiveQuantityInvalid: 'Informe uma quantidade recebida válida.',
  forbidden: 'Você não tem permissão para gerenciar compras nesta clínica.',
  notFound: 'Este registro não está mais disponível nesta clínica.',
  duplicate: 'Já existe um fornecedor com este documento.',
  schemaPending:
    'Compras ainda estão sendo preparadas no banco. Aplique a migration indicada e tente novamente.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a ação agora. Tente novamente.',
} as const

function optionalText(max: number, message: string) {
  return z
    .union([z.literal(''), z.null(), z.string().trim().max(max, message)])
    .transform((value) => (typeof value === 'string' && value ? value : null))
}

function optionalEmail() {
  return z
    .union([
      z.literal(''),
      z.null(),
      z.string().trim().max(254, purchaseMessages.emailTooLong).email(purchaseMessages.emailInvalid),
    ])
    .transform((value) => (typeof value === 'string' && value ? value.toLowerCase() : null))
}

function optionalCalendarDate() {
  return z
    .union([z.literal(''), z.null(), z.iso.date(purchaseMessages.dateInvalid)])
    .transform((value, context) => {
      if (!value) return null
      const result = new Date(`${value}T12:00:00`)
      if (Number.isNaN(result.getTime())) {
        context.addIssue({ code: 'custom', message: purchaseMessages.dateInvalid })
        return z.NEVER
      }
      return result
    })
}

const supplierShape = {
  name: z.string().trim().min(2, purchaseMessages.nameRequired).max(140, purchaseMessages.nameTooLong),
  taxId: optionalText(40, purchaseMessages.taxIdTooLong),
  email: optionalEmail(),
  phone: optionalText(30, purchaseMessages.phoneTooLong),
  notes: optionalText(1000, purchaseMessages.notesTooLong),
}

export const createPurchaseSupplierSchema = z.object(supplierShape)
export type CreatePurchaseSupplierInput = z.infer<typeof createPurchaseSupplierSchema>

export const updatePurchaseSupplierSchema = z.object({
  supplierId: z.uuid(purchaseMessages.notFound),
  ...supplierShape,
})
export type UpdatePurchaseSupplierInput = z.infer<typeof updatePurchaseSupplierSchema>

export const togglePurchaseSupplierSchema = z.object({
  supplierId: z.uuid(purchaseMessages.notFound),
  isActive: z.boolean(),
})
export type TogglePurchaseSupplierInput = z.infer<typeof togglePurchaseSupplierSchema>

const orderItemSchema = z.object({
  inventoryItemId: z.uuid(purchaseMessages.itemInvalid),
  quantity: z.number().int(purchaseMessages.quantityInvalid).min(1, purchaseMessages.quantityInvalid).max(1_000_000, purchaseMessages.quantityInvalid),
  unitCostCents: z.number().int(purchaseMessages.costInvalid).min(0, purchaseMessages.costInvalid).max(2_000_000_000, purchaseMessages.costInvalid),
})

export const createPurchaseOrderSchema = z.object({
  supplierId: z.uuid(purchaseMessages.supplierInvalid),
  expectedDeliveryDate: optionalCalendarDate(),
  notes: optionalText(1000, purchaseMessages.notesTooLong),
  items: z
    .array(orderItemSchema)
    .min(1, purchaseMessages.orderWithoutItems)
    .max(50, purchaseMessages.orderWithoutItems)
    .superRefine((items, context) => {
      const ids = new Set<string>()
      items.forEach((item, index) => {
        if (ids.has(item.inventoryItemId)) {
          context.addIssue({
            code: 'custom',
            path: [index, 'inventoryItemId'],
            message: purchaseMessages.duplicateItems,
          })
        }
        ids.add(item.inventoryItemId)
      })
    }),
})
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>

const transitionStatuses = ['requested', 'approved', 'ordered', 'cancelled'] as const
export const transitionPurchaseOrderSchema = z.object({
  orderId: z.uuid(purchaseMessages.notFound),
  status: z.enum(transitionStatuses, purchaseMessages.statusInvalid),
})
export type TransitionPurchaseOrderInput = z.infer<typeof transitionPurchaseOrderSchema>

export const receivePurchaseOrderItemSchema = z.object({
  orderItemId: z.uuid(purchaseMessages.notFound),
  quantity: z.number().int(purchaseMessages.receiveQuantityInvalid).min(1, purchaseMessages.receiveQuantityInvalid).max(1_000_000, purchaseMessages.receiveQuantityInvalid),
})
export type ReceivePurchaseOrderItemInput = z.infer<typeof receivePurchaseOrderItemSchema>

export interface PurchaseSupplierDto {
  id: string
  name: string
  taxId: string | null
  email: string | null
  phone: string | null
  notes: string | null
  isActive: boolean
  updatedAt: string
}

export interface PurchaseCatalogItemDto {
  id: string
  name: string
  unit: string
  currentQuantity: number
}

export interface PurchaseOrderItemDto {
  id: string
  inventoryItemId: string
  inventoryItemName: string
  inventoryItemUnit: string
  quantity: number
  unitCostCents: number
  receivedQuantity: number
}

export interface PurchaseOrderDto {
  id: string
  supplier: { id: string; name: string }
  status: PurchaseOrderStatus
  expectedDeliveryDate: string | null
  totalCents: number
  notes: string | null
  items: readonly PurchaseOrderItemDto[]
  createdAt: string
  updatedAt: string
}

export interface PurchaseSupplierFormValues {
  name: string
  taxId: string
  email: string
  phone: string
  notes: string
}

export interface PurchaseOrderFormItemValues {
  inventoryItemId: string
  quantity: number
  unitCostCents: number
}

export interface PurchaseOrderFormValues {
  supplierId: string
  expectedDeliveryDate: string
  notes: string
  items: readonly PurchaseOrderFormItemValues[]
}

export const purchaseOrderStatusOptions = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'requested', label: 'Solicitado' },
  { value: 'approved', label: 'Aprovado' },
  { value: 'ordered', label: 'Pedido enviado' },
  { value: 'partially_received', label: 'Recebimento parcial' },
  { value: 'received', label: 'Recebido' },
  { value: 'cancelled', label: 'Cancelado' },
] as const satisfies readonly { value: PurchaseOrderStatus; label: string }[]
