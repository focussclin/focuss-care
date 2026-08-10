import { z } from 'zod'

export const priceListMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  nameRequired: 'Dê um nome à tabela.',
  nameTooLong: 'Use no máximo 120 caracteres.',
  dateInvalid: 'Informe uma data válida.',
  windowInverted: 'O início da validade precisa vir antes do fim.',
  priceInvalid: 'O preço deve ser um valor inteiro em centavos, de 0 a 20 milhões.',
  serviceRequired: 'Escolha um serviço.',
  duplicateService:
    'Este serviço já tem preço nesta tabela. Edite o valor existente em vez de criar um segundo.',
  forbidden: 'Você não tem permissão para gerenciar tabelas de preço nesta clínica.',
  notFound: 'Esta tabela não está mais disponível nesta clínica.',
  writeForbidden:
    'A tabela foi carregada, mas o banco recusou a gravação. Falta policy de escrita em `price_lists` para este papel.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a ação agora. Tente novamente.',
  /**
   * Exibido no painel. Ver o JSDoc de `domain/PriceList.ts`.
   */
  shareUnavailable:
    "O repasse ao profissional não é gerenciado aqui: `price_list_items` guarda percentual E valor em centavos, e nada declara qual vence quando os dois estão preenchidos. Para destravar, rode no banco: select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.price_list_items'::regclass;",
} as const

const optionalDate = z
  .union([
    z.literal(''),
    z.null(),
    z
      .string()
      .trim()
      .refine(
        (value) => !Number.isNaN(new Date(value).getTime()),
        priceListMessages.dateInvalid,
      ),
  ])
  .transform((value) => value || null)

const listShape = {
  name: z
    .string()
    .trim()
    .min(2, priceListMessages.nameRequired)
    .max(120, priceListMessages.nameTooLong),
  validFrom: optionalDate,
  validUntil: optionalDate,
}

/**
 * `isDefault` e `isActive` NÃO entram no formulário.
 *
 * Promover a padrão mexe em OUTRAS tabelas — tirar o padrão de quem tinha —, e
 * um checkbox no meio de um formulário de nome esconderia esse efeito. As duas
 * são ações próprias, com botão próprio.
 *
 * O repasse ao profissional também fica de fora: ver `shareUnavailable`.
 */
export const createPriceListSchema = z.object(listShape).refine(
  (value) =>
    !value.validFrom ||
    !value.validUntil ||
    new Date(value.validFrom).getTime() <= new Date(value.validUntil).getTime(),
  { message: priceListMessages.windowInverted, path: ['validUntil'] },
)
export type CreatePriceListInput = z.infer<typeof createPriceListSchema>

export const updatePriceListSchema = z
  .object({ listId: z.uuid(priceListMessages.notFound), ...listShape })
  .refine(
    (value) =>
      !value.validFrom ||
      !value.validUntil ||
      new Date(value.validFrom).getTime() <= new Date(value.validUntil).getTime(),
    { message: priceListMessages.windowInverted, path: ['validUntil'] },
  )
export type UpdatePriceListInput = z.infer<typeof updatePriceListSchema>

export const setPriceListActiveSchema = z.object({
  listId: z.uuid(priceListMessages.notFound),
  isActive: z.boolean(),
})
export type SetPriceListActiveInput = z.infer<typeof setPriceListActiveSchema>

export const setDefaultPriceListSchema = z.object({
  listId: z.uuid(priceListMessages.notFound),
})
export type SetDefaultPriceListInput = z.infer<typeof setDefaultPriceListSchema>

export const setItemPriceSchema = z.object({
  listId: z.uuid(priceListMessages.notFound),
  serviceId: z.uuid(priceListMessages.serviceRequired),
  priceCents: z
    .number()
    .int(priceListMessages.priceInvalid)
    .min(0, priceListMessages.priceInvalid)
    .max(2_000_000_000, priceListMessages.priceInvalid),
})
export type SetItemPriceInput = z.infer<typeof setItemPriceSchema>

export const removePriceListItemSchema = z.object({
  listId: z.uuid(priceListMessages.notFound),
  itemId: z.uuid(priceListMessages.notFound),
})
export type RemovePriceListItemInput = z.infer<typeof removePriceListItemSchema>

export interface PriceListItemDto {
  id: string
  serviceId: string
  serviceName: string
  serviceCode: string | null
  priceCents: number
}

export interface PriceListDto {
  id: string
  name: string
  isDefault: boolean
  validFrom: string | null
  validUntil: string | null
  isActive: boolean
  items: readonly PriceListItemDto[]
}

export interface PriceListFormValues {
  name: string
  validFrom: string
  validUntil: string
}
