import { z } from 'zod'

import type {
  PatientListQuery,
  PatientStatusFilter,
} from '../domain/PatientRepository'

/**
 * Contrato da QUERY da listagem — o que a URL pode dizer sobre a pagina.
 *
 * Tudo que entra aqui e hostil por definicao: chega da barra de endereco, de um
 * link colado ou de um script. Por isso nenhum campo lanca: todo valor invalido
 * degrada para o padrao seguro, e a tela serve a primeira pagina em vez de 500.
 */

/** Tamanho de pagina quando a URL nao pede outro. */
export const PATIENT_PAGE_DEFAULT_SIZE = 20

/**
 * Teto absoluto de linhas por pagina.
 *
 * Aceitar `limit` do cliente sem teto e o vetor mais barato de exfiltracao em
 * massa (`?limit=100000` baixa a clinica inteira) e de DoS numa listagem
 * multi-tenant. O clamp mora no servidor porque e a unica borda que o cliente
 * nao controla.
 */
export const PATIENT_PAGE_MAX_SIZE = 50

/** Termo de busca mais longo que isto e ruido, nao intencao. */
export const PATIENT_SEARCH_MAX_LENGTH = 80

/** Um cursor legitimo tem ~90 bytes; o teto so barra payload absurdo. */
export const PATIENT_CURSOR_MAX_LENGTH = 256

/**
 * Caracteres de controle e de formatacao invisivel.
 *
 * `Cc` cobre C0/C1 (inclusive nova linha e o DEL); `Cf` cobre os invisiveis —
 * largura zero e sobrescrita bidirecional. Nenhum deles ajuda a encontrar um
 * paciente, e todos escondem o que a string realmente contem.
 */
const INVISIBLE_CHARS = /[\p{Cc}\p{Cf}]/gu

/**
 * Curingas do `ILIKE`. Sao REMOVIDOS, nao escapados: o PostgREST nao expoe a
 * clausula `ESCAPE` do `LIKE`, entao escapar e impossivel — e quem digita
 * "100%" nao pode ter o `%` promovido a "qualquer coisa".
 */
const LIKE_WILDCARDS = /[%_]/g

/**
 * Caracteres que mudam a GRAMATICA do filtro do PostgREST.
 *
 * O termo entra numa string de filtro (`or=(col.ilike."...")`), nao num
 * prepared statement. Isto nao e SQL injection — a RLS e o `eq('clinic_id')`
 * continuam valendo, e o `is('deleted_at', null)` e um AND separado — mas
 * virgula, parenteses, aspas e barra invertida conseguem acrescentar condicao
 * ao filtro. Somem antes de chegar perto da query.
 *
 * O ponto NAO esta na lista: e-mail depende dele, e as aspas duplas em volta do
 * valor o tornam inofensivo.
 */
const POSTGREST_GRAMMAR = /["'\\/,():;&|]/g

/**
 * Termo cru -> termo que pode virar filtro.
 *
 * Idempotente de proposito: a rota sanitiza para montar a query, o adapter
 * sanitiza de novo antes de escrever o filtro. Um dos dois pode ser esquecido
 * numa refatoracao; os dois, dificilmente.
 */
export function sanitizePatientSearch(raw: unknown): string | null {
  if (typeof raw !== 'string') return null

  const cleaned = raw
    .replace(LIKE_WILDCARDS, '')
    .replace(INVISIBLE_CHARS, ' ')
    .replace(POSTGREST_GRAMMAR, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PATIENT_SEARCH_MAX_LENGTH)
    .trim()

  return cleaned.length === 0 ? null : cleaned
}

export const patientStatusFilterValues = [
  'all',
  'active',
  'inactive',
] as const satisfies readonly PatientStatusFilter[]

/**
 * `?a=1&a=2` chega como array. Vale o primeiro: repetir o parametro e
 * ambiguidade do chamador, nao intencao de filtrar duas vezes.
 */
function firstValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined
  }

  return typeof value === 'string' ? value : undefined
}

const searchParam = z
  .preprocess(firstValue, z.string().optional().catch(undefined))
  .transform(sanitizePatientSearch)

const statusParam = z.preprocess(
  firstValue,
  z.enum(patientStatusFilterValues).catch('all'),
)

const cursorParam = z
  .preprocess(
    firstValue,
    z.string().max(PATIENT_CURSOR_MAX_LENGTH).optional().catch(undefined),
  )
  .transform((value) => (value && value.length > 0 ? value : null))

/**
 * O limite e CLAMPADO, nao recusado.
 *
 * `?limit=1000` devolve 50 (o teto) em vez do padrao: quem pediu muito recebe o
 * maximo permitido, e a diferenca fica visivel. Ja `0`, `-1` e `abc` nao sao
 * "muito" nem "pouco" — sao ausencia de pedido, e caem no padrao.
 */
const limitParam = z
  .preprocess(firstValue, z.coerce.number().catch(Number.NaN))
  .transform((value) => {
    if (!Number.isFinite(value)) return PATIENT_PAGE_DEFAULT_SIZE

    const asInt = Math.trunc(value)
    if (asInt < 1) return PATIENT_PAGE_DEFAULT_SIZE

    return Math.min(asInt, PATIENT_PAGE_MAX_SIZE)
  })

const patientListQuerySchema = z.object({
  q: searchParam,
  status: statusParam,
  cursor: cursorParam,
  limit: limitParam,
})

/** O que a rota le do `searchParams` — `string | string[] | undefined` por chave. */
export type PatientSearchParams = Record<string, unknown>

/**
 * `searchParams` -> recorte da listagem. **Nunca lanca.**
 *
 * Cada campo tem `catch` proprio: um `status` invalido nao pode derrubar o
 * `limit` junto, e uma URL adulterada inteira ainda produz a primeira pagina
 * padrao do proprio tenant.
 */
export function parsePatientListQuery(
  searchParams: PatientSearchParams | undefined,
): PatientListQuery {
  const parsed = patientListQuerySchema.parse(searchParams ?? {})

  return {
    search: parsed.q,
    status: parsed.status,
    cursor: parsed.cursor,
    limit: parsed.limit,
  }
}

/**
 * Monta o querystring canonico da listagem.
 *
 * Um lugar so para a regra de que a paginacao depende: **trocar filtro descarta
 * o cursor.** Um cursor e uma posicao dentro de UM resultado; aplicado a outro
 * conjunto, ele salta linhas em silencio.
 */
export function patientListHref(
  query: { search: string | null; status: PatientStatusFilter },
  cursor: string | null = null,
): string {
  const params = new URLSearchParams()

  if (query.search) params.set('q', query.search)
  if (query.status !== 'all') params.set('status', query.status)
  if (cursor) params.set('cursor', cursor)

  const queryString = params.toString()

  return queryString.length > 0 ? `/pacientes?${queryString}` : '/pacientes'
}
