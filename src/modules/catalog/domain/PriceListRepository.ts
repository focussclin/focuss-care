import type { NewPriceListData, PriceList } from './PriceList'

export type PriceListErrorReason =
  | 'forbidden'
  /**
   * A tabela é legível, mas a escrita não alcançou a linha.
   *
   * Sem policy de UPDATE em `price_lists` para o papel, o Postgres não devolve
   * erro: zero linhas mudam, em silêncio.
   */
  | 'write-forbidden'
  | 'duplicate'
  | 'not-found'
  | 'unavailable'
  | 'unexpected'

export class PriceListError extends Error {
  constructor(
    readonly reason: PriceListErrorReason,
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'PriceListError'
  }
}

export function isPriceListError(cause: unknown): cause is PriceListError {
  return cause instanceof PriceListError
}

/**
 * **Nenhum método escreve `professional_share_percent` nem
 * `professional_share_cents`.**
 *
 * As duas expressam o repasse ao profissional e nada declara qual vence.
 * Escolher seria adivinhar um número que vira dinheiro no bolso de alguém.
 */
export interface PriceListRepository {
  list(clinicId: string): Promise<PriceList[]>
  create(clinicId: string, data: NewPriceListData): Promise<PriceList>
  update(clinicId: string, listId: string, data: NewPriceListData): Promise<PriceList>
  setActive(clinicId: string, listId: string, isActive: boolean): Promise<PriceList>
  /**
   * Promove a tabela a padrão, tirando o padrão das outras.
   *
   * No máximo uma por clínica: duas tabelas padrão deixam quem fatura sem saber
   * qual preço vale.
   */
  setDefault(clinicId: string, listId: string): Promise<PriceList>
  setItemPrice(
    clinicId: string,
    listId: string,
    serviceId: string,
    priceCents: number,
  ): Promise<PriceList>
  removeItem(clinicId: string, listId: string, itemId: string): Promise<PriceList>
}
