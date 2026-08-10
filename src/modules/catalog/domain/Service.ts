/**
 * Catálogo de serviços — o que a clínica faz, quanto dura e quanto custa.
 *
 * # Por que esta tabela vale mais que o tamanho dela
 *
 * `invoice_items.service_id` aponta para cá, e hoje é sempre nulo: sem
 * catálogo, cada item de fatura é texto digitado na hora, e duas pessoas
 * cobrando o mesmo procedimento escrevem nomes e valores diferentes. A duração
 * padrão tem o mesmo papel na agenda, onde as opções hoje são uma lista fixa no
 * código.
 *
 * # Nenhuma convenção adivinhada
 *
 * Todas as colunas se explicam sozinhas, e é por isso que esta fatia pôde ser
 * escrita inteira: `default_price_cents` em centavos e `deleted_at` para
 * exclusão lógica são convenções declaradas em `docs/03-banco-de-dados.md`;
 * `default_duration_minutes` traz a unidade no nome. Não há nenhum `severity`
 * nem `weekday` aqui.
 *
 * # `is_active` e `deleted_at` NÃO são a mesma coisa
 *
 * Desativar é operacional e reversível: o serviço sai do que se pode oferecer
 * hoje e continua na lista, porque volta no mês que vem. Excluir é remover do
 * catálogo — e mesmo assim a linha permanece no banco, porque
 * `invoice_items.service_id` pode apontar para ela: apagar de verdade deixaria
 * faturas antigas sem saber o que foi cobrado.
 */

export interface Service {
  id: string
  code: string | null
  /** Código TUSS, o padrão de procedimentos usado por convênios no Brasil. */
  tussCode: string | null
  name: string
  description: string | null
  category: string | null
  defaultDurationMinutes: number | null
  defaultPriceCents: number
  /** Convênio exige autorização prévia para este procedimento. */
  requiresAuthorization: boolean
  isActive: boolean
  updatedAt: Date
}

export interface NewServiceData {
  code: string | null
  tussCode: string | null
  name: string
  description: string | null
  category: string | null
  defaultDurationMinutes: number | null
  defaultPriceCents: number
  requiresAuthorization: boolean
}

export type ServiceUpdateData = NewServiceData

/**
 * Código repetido no catálogo é ambiguidade na fatura.
 *
 * O código é o que liga o serviço ao que o convênio e o financeiro entendem.
 * Dois serviços com o mesmo código deixam quem fatura sem saber qual valor
 * vale, e a escolha vira sorte. Nome repetido é aceitável — "Consulta" e
 * "Consulta (retorno)" convivem —, código não.
 */
export function normalizeCode(code: string): string {
  return code.trim().toLocaleUpperCase('pt-BR')
}

export function findSameCode(
  services: readonly Service[],
  code: string | null,
  exceptId?: string,
): Service | null {
  if (code === null) return null
  const target = normalizeCode(code)

  return (
    services.find(
      (service) =>
        service.id !== exceptId &&
        service.code !== null &&
        normalizeCode(service.code) === target,
    ) ?? null
  )
}

/** Ativos primeiro, e em ordem alfabética dentro de cada grupo. */
export function sortForCatalog<T extends { isActive: boolean; name: string }>(
  services: readonly T[],
): T[] {
  return [...services].sort((left, right) => {
    if (left.isActive !== right.isActive) return left.isActive ? -1 : 1
    return left.name.localeCompare(right.name, 'pt-BR')
  })
}

/** As categorias em uso, para o filtro — nunca uma lista inventada. */
export function categoriesOf(services: readonly Service[]): string[] {
  const found = new Set<string>()
  for (const service of services) {
    if (service.category) found.add(service.category)
  }
  return [...found].sort((left, right) => left.localeCompare(right, 'pt-BR'))
}

export interface CatalogFilters {
  query: string
  category: string
  onlyActive: boolean
}

export const DEFAULT_CATALOG_FILTERS: CatalogFilters = {
  query: '',
  category: 'all',
  onlyActive: true,
}

/**
 * A busca alcança nome, código e TUSS.
 *
 * Quem fatura procura pelo código; quem agenda procura pelo nome. Uma busca que
 * só olhasse o nome obrigaria o financeiro a decorar a nomenclatura da
 * recepção.
 */
export function filterCatalog<
  T extends {
    name: string
    code: string | null
    tussCode: string | null
    category: string | null
    isActive: boolean
  },
>(services: readonly T[], filters: CatalogFilters): T[] {
  const query = filters.query.trim().toLocaleLowerCase('pt-BR')

  return services.filter((service) => {
    if (filters.onlyActive && !service.isActive) return false
    if (filters.category !== 'all' && service.category !== filters.category) return false
    if (!query) return true

    return [service.name, service.code ?? '', service.tussCode ?? ''].some((value) =>
      value.toLocaleLowerCase('pt-BR').includes(query),
    )
  })
}
