import type { PriceList } from '../domain/PriceList'
import type { PriceListDto } from '../schemas/priceList.schema'

/**
 * O repasse ao profissional nao atravessa a fronteira porque nem e lido.
 *
 * Ver o JSDoc de `domain/PriceList.ts`: as duas colunas expressam a mesma coisa
 * e nada declara qual vence.
 */
export function toPriceListDto(list: PriceList): PriceListDto {
  return {
    id: list.id,
    name: list.name,
    isDefault: list.isDefault,
    validFrom: list.validFrom?.toISOString() ?? null,
    validUntil: list.validUntil?.toISOString() ?? null,
    isActive: list.isActive,
    items: list.items.map((item) => ({
      id: item.id,
      serviceId: item.serviceId,
      serviceName: item.serviceName,
      serviceCode: item.serviceCode,
      priceCents: item.priceCents,
    })),
  }
}
