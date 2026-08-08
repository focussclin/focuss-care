import 'server-only'

import { sanitizePatientSearch } from '../schemas/patientQuery.schema'

/**
 * Tradutores de recorte -> string de filtro do PostgREST.
 *
 * Isolados do adapter porque sao a unica parte da listagem que monta SINTAXE a
 * partir de valor: e o que o teste precisa inspecionar sem falar com o banco.
 */

/** Menos digitos que isto casaria com meia clinica e afogaria a busca por nome. */
const MIN_PHONE_DIGITS = 3

export interface PatientKeysetAnchor {
  id: string
  fullName: string
}

/**
 * Valor dentro de aspas duplas no filtro.
 *
 * As aspas sao obrigatorias, nao decorativas: sem elas o ponto de um e-mail
 * separaria coluna de operador. Dentro delas, o PostgREST le `\` como escape,
 * entao `\` e `"` precisam ser dobrados — e um paciente chamado `Joao "Jota"`
 * existe.
 */
function quoteFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/**
 * Termo -> grupo `or` da busca, ou `null` quando nao ha o que buscar.
 *
 * Campos e por que cada um:
 *
 *  - **`full_name`, `email`** — `ilike` infixo. Sem indice trigram isso e seq
 *    scan DENTRO da fatia da clinica: correto, e O(n) por clinica. O indice e
 *    P-02b (depende de migration).
 *  - **`phone`** — `like` por PREFIXO sobre digitos. A coluna guarda so digitos
 *    (ver `patientMapper`), e prefixo e a unica forma que um btree comum atende.
 *    Consequencia honesta: buscar pelos 4 ultimos digitos nao acha; buscar com
 *    DDD acha.
 *  - **`cpf` e `cns` ficam de fora, de proposito.** Buscar por CPF transformaria
 *    a listagem em oraculo de existencia de CPF por tentativa e erro. P-03.
 *
 * O termo e sanitizado DE NOVO aqui, mesmo ja tendo passado pelo schema da rota:
 * esta funcao e a ultima borda antes da string de query, e nao pode depender de
 * quem a chamou ter feito a parte dele.
 */
export function buildPatientSearchFilter(search: string | null): string | null {
  const term = sanitizePatientSearch(search)
  if (term === null) return null

  const value = quoteFilterValue(term)
  const clauses = [`full_name.ilike."%${value}%"`, `email.ilike."%${value}%"`]

  const digits = term.replace(/[^0-9]/g, '')
  if (digits.length >= MIN_PHONE_DIGITS) {
    clauses.push(`phone.like."${digits}%"`)
  }

  return clauses.join(',')
}

/**
 * Ancora -> grupo `or` do keyset: "depois desta linha em `(full_name, id)`".
 *
 * O desempate por `id` nao e decorativo. Com `order by full_name` sozinho, dois
 * homonimos podem REPETIR ou SUMIR na fronteira entre paginas, e o defeito so
 * aparece em producao, com base grande.
 *
 * Risco conhecido: `gt` e `order by` usam a MESMA colacao da coluna, entao o
 * keyset e consistente por construcao — exceto sob colacao nao deterministica
 * (ICU com `deterministic = false`), em que `eq` casa com mais de uma grafia.
 * Nao e o padrao do Supabase e nao e verificavel a partir do repositorio (B1 da
 * revisao de P-02); se for confirmada, a ordem passa a ser `(created_at, id)`.
 */
export function buildPatientKeysetFilter(anchor: PatientKeysetAnchor): string {
  const name = quoteFilterValue(anchor.fullName)

  return `full_name.gt."${name}",and(full_name.eq."${name}",id.gt.${anchor.id})`
}
