'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toPriceListFailure } from '../application/priceListFailure'
import { toPriceListDto } from '../application/toPriceListDto'
import { priceListRepositoryFor } from '../infrastructure/price-list-repository'
import {
  createPriceListSchema,
  priceListMessages,
  removePriceListItemSchema,
  setDefaultPriceListSchema,
  setItemPriceSchema,
  setPriceListActiveSchema,
  updatePriceListSchema,
  type CreatePriceListInput,
  type PriceListDto,
  type PriceListFormValues,
  type RemovePriceListItemInput,
  type SetDefaultPriceListInput,
  type SetItemPriceInput,
  type SetPriceListActiveInput,
  type UpdatePriceListInput,
} from '../schemas/priceList.schema'

/*
 * `clinic.settings` — mesma permissão do catálogo de serviços.
 *
 * Uma tabela de preço define quanto a clínica cobra, e mexer nela muda o valor
 * para todo mundo. É a mesma natureza do horário de funcionamento e do
 * cadastro dos serviços.
 */
const WRITE_ROLES = rolesWith('clinic.settings')

const messages = {
  validation: priceListMessages.invalidFields,
  unavailable: priceListMessages.unavailable,
  unexpected: priceListMessages.unexpected,
}

const REVALIDATE = ['/servicos'] as const

function parseDate(value: string | null): Date | null {
  return value ? new Date(value) : null
}

const runCreate = createAction<CreatePriceListInput, PriceListDto, 'name' | 'validFrom' | 'validUntil'>({
  name: 'price_list.create',
  schema: createPriceListSchema,
  roles: WRITE_ROLES,
  messages,
  revalidatePaths: [...REVALIDATE],
  handler: async (input, context) => {
    try {
      const list = await priceListRepositoryFor(context.supabase).create(context.clinicId, {
        name: input.name,
        validFrom: parseDate(input.validFrom),
        validUntil: parseDate(input.validUntil),
      })
      return ok(toPriceListDto(list))
    } catch (cause) {
      return toPriceListFailure<'name' | 'validFrom' | 'validUntil'>('price_list.create', cause)
    }
  },
  audit: (output) => ({
    action: 'price_list.created',
    entityType: 'price_list',
    entityId: output.id,
    after: { name: output.name },
  }),
})

const runUpdate = createAction<UpdatePriceListInput, PriceListDto, 'listId' | 'name' | 'validFrom' | 'validUntil'>({
  name: 'price_list.update',
  schema: updatePriceListSchema,
  roles: WRITE_ROLES,
  messages,
  revalidatePaths: [...REVALIDATE],
  handler: async (input, context) => {
    try {
      const list = await priceListRepositoryFor(context.supabase).update(
        context.clinicId,
        input.listId,
        {
          name: input.name,
          validFrom: parseDate(input.validFrom),
          validUntil: parseDate(input.validUntil),
        },
      )
      return ok(toPriceListDto(list))
    } catch (cause) {
      return toPriceListFailure<'listId' | 'name' | 'validFrom' | 'validUntil'>(
        'price_list.update',
        cause,
      )
    }
  },
  audit: (output) => ({
    action: 'price_list.updated',
    entityType: 'price_list',
    entityId: output.id,
    after: { name: output.name },
  }),
})

const runSetActive = createAction<SetPriceListActiveInput, PriceListDto, 'listId' | 'isActive'>({
  name: 'price_list.set_active',
  schema: setPriceListActiveSchema,
  roles: WRITE_ROLES,
  messages,
  revalidatePaths: [...REVALIDATE],
  handler: async (input, context) => {
    try {
      const list = await priceListRepositoryFor(context.supabase).setActive(
        context.clinicId,
        input.listId,
        input.isActive,
      )
      return ok(toPriceListDto(list))
    } catch (cause) {
      return toPriceListFailure<'listId' | 'isActive'>('price_list.set_active', cause)
    }
  },
  audit: (output) => ({
    action: output.isActive ? 'price_list.activated' : 'price_list.deactivated',
    entityType: 'price_list',
    entityId: output.id,
    after: { is_active: output.isActive },
  }),
})

/**
 * Promover a padrão mexe em OUTRAS tabelas — por isso é action própria.
 *
 * No máximo uma tabela padrão por clínica: duas deixam quem fatura sem saber
 * qual preço vale. O repositório limpa o padrão anterior antes de promover.
 */
const runSetDefault = createAction<SetDefaultPriceListInput, PriceListDto, 'listId'>({
  name: 'price_list.set_default',
  schema: setDefaultPriceListSchema,
  roles: WRITE_ROLES,
  messages,
  revalidatePaths: [...REVALIDATE],
  handler: async (input, context) => {
    try {
      const list = await priceListRepositoryFor(context.supabase).setDefault(
        context.clinicId,
        input.listId,
      )
      return ok(toPriceListDto(list))
    } catch (cause) {
      return toPriceListFailure<'listId'>('price_list.set_default', cause)
    }
  },
  audit: (output) => ({
    action: 'price_list.default_changed',
    entityType: 'price_list',
    entityId: output.id,
    after: { name: output.name },
  }),
})

const runSetItemPrice = createAction<SetItemPriceInput, PriceListDto, 'listId' | 'serviceId' | 'priceCents'>({
  name: 'price_list.set_item_price',
  schema: setItemPriceSchema,
  roles: WRITE_ROLES,
  messages,
  revalidatePaths: [...REVALIDATE],
  handler: async (input, context) => {
    try {
      const list = await priceListRepositoryFor(context.supabase).setItemPrice(
        context.clinicId,
        input.listId,
        input.serviceId,
        input.priceCents,
      )
      return ok(toPriceListDto(list))
    } catch (cause) {
      return toPriceListFailure<'listId' | 'serviceId' | 'priceCents'>(
        'price_list.set_item_price',
        cause,
      )
    }
  },
  /*
   * A trilha guarda o serviço e o valor: preço é o dado que se contesta depois,
   * e `audit_log` é onde se reconstrói quem mudou o quê.
   */
  audit: (output, input) => ({
    action: 'price_list.item_priced',
    entityType: 'price_list',
    entityId: output.id,
    after: { service_id: input.serviceId, price_cents: input.priceCents },
  }),
})

const runRemoveItem = createAction<RemovePriceListItemInput, PriceListDto, 'listId' | 'itemId'>({
  name: 'price_list.remove_item',
  schema: removePriceListItemSchema,
  roles: WRITE_ROLES,
  messages,
  revalidatePaths: [...REVALIDATE],
  handler: async (input, context) => {
    try {
      const list = await priceListRepositoryFor(context.supabase).removeItem(
        context.clinicId,
        input.listId,
        input.itemId,
      )
      return ok(toPriceListDto(list))
    } catch (cause) {
      return toPriceListFailure<'listId' | 'itemId'>('price_list.remove_item', cause)
    }
  },
  audit: (output, input) => ({
    action: 'price_list.item_removed',
    entityType: 'price_list',
    entityId: output.id,
    after: { item_id: input.itemId },
  }),
})

export async function submitPriceListFromScreen(
  values: PriceListFormValues,
  listId: string | null,
): Promise<string | null> {
  const result = listId
    ? await runUpdate({ listId, ...values })
    : await runCreate(values)
  return result.ok ? null : result.error.message
}

export async function setPriceListActiveFromScreen(
  listId: string,
  isActive: boolean,
): Promise<string | null> {
  const result = await runSetActive({ listId, isActive })
  return result.ok ? null : result.error.message
}

export async function setDefaultPriceListFromScreen(
  listId: string,
): Promise<string | null> {
  const result = await runSetDefault({ listId })
  return result.ok ? null : result.error.message
}

export async function setItemPriceFromScreen(
  listId: string,
  serviceId: string,
  priceCents: number,
): Promise<string | null> {
  const result = await runSetItemPrice({ listId, serviceId, priceCents })
  return result.ok ? null : result.error.message
}

export async function removePriceListItemFromScreen(
  listId: string,
  itemId: string,
): Promise<string | null> {
  const result = await runRemoveItem({ listId, itemId })
  return result.ok ? null : result.error.message
}

export async function createPriceListAction(
  rawInput: unknown,
): Promise<ActionResult<PriceListDto, 'name' | 'validFrom' | 'validUntil'>> {
  return runCreate(rawInput)
}
