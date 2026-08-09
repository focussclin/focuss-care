import { z } from 'zod'

import {
  INVENTORY_MOVEMENT_TYPES,
  type InventoryMovementType,
} from '../domain/Inventory'

export const inventoryMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  nameRequired: 'Informe o nome do item.',
  nameTooLong: 'Use no máximo 120 caracteres.',
  skuTooLong: 'Use no máximo 60 caracteres no SKU.',
  unitRequired: 'Informe a unidade de medida.',
  unitTooLong: 'Use no máximo 30 caracteres na unidade.',
  minimumInvalid: 'O estoque mínimo deve ser um inteiro entre 0 e 1.000.000.',
  quantityInvalid: 'A quantidade deve ser um inteiro maior que zero.',
  costInvalid: 'O custo deve ser um valor inteiro em centavos maior ou igual a zero.',
  reasonTooLong: 'Use no máximo 240 caracteres no motivo.',
  notesTooLong: 'Use no máximo 500 caracteres nas observações.',
  typeInvalid: 'Escolha entrada ou saída.',
  forbidden: 'Você não tem permissão para gerenciar o estoque nesta clínica.',
  notFound: 'Este item não está mais disponível nesta clínica.',
  duplicate: 'Já existe um item com este SKU nesta clínica.',
  insufficientStock: 'A saída é maior que o saldo disponível.',
  invalidMovement: 'Informe uma movimentação válida.',
  schemaPending:
    'O estoque ainda está sendo preparado no banco. Aplique a migration indicada e tente novamente.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a ação agora. Tente novamente.',
} as const

const optionalText = (max: number, message: string) =>
  z
    .union([z.literal(''), z.string().trim().max(max, message)])
    .transform((value) => value || null)

const itemDataShape = {
  name: z.string().trim().min(2, inventoryMessages.nameRequired).max(120, inventoryMessages.nameTooLong),
  sku: optionalText(60, inventoryMessages.skuTooLong).transform((value) => value?.toUpperCase() ?? null),
  unit: z.string().trim().min(1, inventoryMessages.unitRequired).max(30, inventoryMessages.unitTooLong),
  minimumQuantity: z.number().int(inventoryMessages.minimumInvalid).min(0, inventoryMessages.minimumInvalid).max(1_000_000, inventoryMessages.minimumInvalid),
  notes: optionalText(500, inventoryMessages.notesTooLong),
}

export const createInventoryItemSchema = z.object(itemDataShape)
export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>

export const updateInventoryItemSchema = z.object({
  itemId: z.uuid(inventoryMessages.notFound),
  ...itemDataShape,
})
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>

export const toggleInventoryItemSchema = z.object({
  itemId: z.uuid(inventoryMessages.notFound),
  isActive: z.boolean(),
})
export type ToggleInventoryItemInput = z.infer<typeof toggleInventoryItemSchema>

export const recordInventoryMovementSchema = z.object({
  itemId: z.uuid(inventoryMessages.notFound),
  movementType: z.enum(INVENTORY_MOVEMENT_TYPES, inventoryMessages.typeInvalid),
  quantity: z.number().int(inventoryMessages.quantityInvalid).min(1, inventoryMessages.quantityInvalid).max(1_000_000, inventoryMessages.quantityInvalid),
  unitCostCents: z.union([z.null(), z.number().int(inventoryMessages.costInvalid).min(0, inventoryMessages.costInvalid).max(2_000_000_000, inventoryMessages.costInvalid)]).default(null),
  reason: optionalText(240, inventoryMessages.reasonTooLong),
})
export type RecordInventoryMovementInput = z.infer<typeof recordInventoryMovementSchema>

export interface InventoryItemDto {
  id: string
  name: string
  sku: string | null
  unit: string
  minimumQuantity: number
  currentQuantity: number
  notes: string | null
  isActive: boolean
  updatedAt: string
}

export interface InventoryMovementDto {
  id: string
  itemId: string
  movementType: InventoryMovementType
  quantity: number
  unitCostCents: number | null
  reason: string | null
  createdAt: string
}

export interface InventoryItemFormValues {
  name: string
  sku: string
  unit: string
  minimumQuantity: number
  notes: string
}

export interface InventoryMovementFormValues {
  itemId: string
  movementType: InventoryMovementType
  quantity: number
  unitCostCents: number | null
  reason: string
}
