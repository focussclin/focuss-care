import type { PriceListDto, PriceListFormValues } from '../schemas/priceList.schema'

export interface PriceListsPanelProps {
  lists: readonly PriceListDto[]
  /** Serviços ativos do catálogo — o que se pode precificar. */
  services: readonly { id: string; name: string }[]
  onSubmitList: (
    values: PriceListFormValues,
    listId: string | null,
  ) => Promise<string | null>
  onSetActive: (listId: string, isActive: boolean) => Promise<string | null>
  onSetDefault: (listId: string) => Promise<string | null>
  onSetItemPrice: (
    listId: string,
    serviceId: string,
    priceCents: number,
  ) => Promise<string | null>
  onRemoveItem: (listId: string, itemId: string) => Promise<string | null>
  /** `clinic.settings` — preço muda o que a clínica cobra de todo mundo. */
  canManage: boolean
  isLive: boolean
  /** Falha de leitura: o painel diz o que houve em vez de fingir lista vazia. */
  loadError?: string | null
}
