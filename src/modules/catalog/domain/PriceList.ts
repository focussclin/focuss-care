/**
 * Tabelas de preço — quanto cada serviço custa, por tabela.
 *
 * # O que liga o catálogo ao convênio
 *
 * `services.default_price_cents` é o preço base do particular. Uma clínica que
 * atende convênio cobra valores diferentes pelo mesmo procedimento, e
 * `price_list_items.service_id` é exatamente esse vínculo. Sem tabela de preço,
 * cada valor de convênio vive na cabeça de quem fatura.
 *
 * # Duas colunas NÃO são escritas, e a razão é a de sempre
 *
 * `price_list_items` tem `professional_share_percent` **e**
 * `professional_share_cents`. As duas expressam o repasse ao profissional, nada
 * declara qual vence quando ambas estão preenchidas, e não há linha gravada que
 * revele a convenção. É a mesma classe de `allergies.severity` e
 * `work_schedules.weekday`.
 *
 * Escolher uma seria adivinhar um número que vira dinheiro no bolso de alguém.
 * A aplicação não lê nem grava as duas; o preço do item é gravado, e o repasse
 * fica onde está. A tela diz isso, e a consulta que destrava está no runbook.
 */

export interface PriceListItem {
  id: string
  serviceId: string
  /** Nome do serviço, resolvido na leitura. */
  serviceName: string
  serviceCode: string | null
  priceCents: number
}

export interface PriceList {
  id: string
  name: string
  /** A tabela usada quando ninguém escolhe outra. No máximo uma por clínica. */
  isDefault: boolean
  validFrom: Date | null
  validUntil: Date | null
  isActive: boolean
  items: readonly PriceListItem[]
}

export interface NewPriceListData {
  name: string
  validFrom: Date | null
  validUntil: Date | null
}

/**
 * Janela de validade coerente: começo antes do fim.
 *
 * Invertida, a tabela nunca vale — e nada na tela denunciaria isso, porque as
 * duas datas são plausíveis isoladas.
 */
export function isValidWindow(validFrom: Date | null, validUntil: Date | null): boolean {
  if (validFrom === null || validUntil === null) return true
  return validFrom.getTime() <= validUntil.getTime()
}

/**
 * A tabela está valendo hoje?
 *
 * Comparação de data, e nada além disso. Uma tabela fora da janela continua
 * existindo e visível — quem fatura um atendimento antigo precisa dela.
 */
export function isInEffect(list: Pick<PriceList, 'validFrom' | 'validUntil'>, now: Date): boolean {
  if (list.validFrom && list.validFrom.getTime() > now.getTime()) return false
  if (list.validUntil && list.validUntil.getTime() < now.getTime()) return false
  return true
}

/**
 * Serviço repetido na mesma tabela é ambiguidade de preço.
 *
 * Dois itens para o mesmo serviço deixam quem fatura sem saber qual valor
 * cobrar, e a escolha vira sorte. Entre tabelas diferentes é o contrário: é
 * exatamente para isso que elas existem.
 */
export function findSameService(
  items: readonly PriceListItem[],
  serviceId: string,
  exceptId?: string,
): PriceListItem | null {
  return items.find((item) => item.id !== exceptId && item.serviceId === serviceId) ?? null
}

/** Padrão primeiro, depois ativas, e alfabética dentro de cada grupo. */
export function sortPriceLists<T extends { isDefault: boolean; isActive: boolean; name: string }>(
  lists: readonly T[],
): T[] {
  return [...lists].sort((left, right) => {
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1
    if (left.isActive !== right.isActive) return left.isActive ? -1 : 1
    return left.name.localeCompare(right.name, 'pt-BR')
  })
}

/** Itens em ordem alfabética de serviço — é como se procura um preço. */
export function sortItems<T extends { serviceName: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) =>
    left.serviceName.localeCompare(right.serviceName, 'pt-BR'),
  )
}

/**
 * Serviços que ainda cabem nesta tabela.
 *
 * Oferecer um serviço já precificado abriria a porta para o segundo item, que é
 * justamente o que não pode existir.
 */
export function availableServices<T extends { id: string }>(
  services: readonly T[],
  items: readonly PriceListItem[],
): T[] {
  const usados = new Set(items.map((item) => item.serviceId))
  return services.filter((service) => !usados.has(service.id))
}
