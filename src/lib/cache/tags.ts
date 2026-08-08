/**
 * A fabrica unica de tags de cache (F-02 do roadmap — divida D3).
 *
 * P4 de docs/roadmap.md: **toda chave e toda tag de cache carrega `clinic_id`**.
 * Vazamento por cache mal chaveado e a falha silenciosa mais cara do produto —
 * a clinica A vendo dado da clinica B, sem erro, sem log, sem sintoma. A §8 de
 * docs/01-arquitetura.md fixa o formato:
 *
 *     OK   clinic:{clinicId}:patients
 *     NAO  patients
 *
 * Ninguem escreve tag a mao. Toda tag sai daqui, e daqui nao sai tag sem clinica.
 *
 * ## Por que isto e mais que concatenar strings
 *
 *  1. **`CacheTag` e um tipo marcado.** Uma string literal nao satisfaz o tipo,
 *     entao `updateTag('patients')` nao compila onde o contrato pede `CacheTag`.
 *     A regra "toda tag vem da fabrica" deixa de depender de revisao humana.
 *  2. **O identificador e validado como UUID.** Nao e formalismo: e o que impede
 *     dado pessoal de virar tag. Nome, e-mail, CPF e telefone nao sao UUID —
 *     entao nao passam. Tag de cache circula em log, em painel de observabilidade
 *     e em chave de storage; e o ultimo lugar onde se quer nome de paciente.
 *  3. **A validacao lanca sem repetir o valor.** Uma mensagem de erro que ecoasse
 *     a entrada invalida colocaria no log exatamente o dado que a regra 2 barrou.
 *  4. **Normaliza para minusculas.** `revalidateTag`/`updateTag` sao
 *     case-sensitive (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidateTag.md).
 *     Sem normalizar, o mesmo id em maiusculas produziria uma tag que a leitura
 *     nunca criou — a invalidacao "funcionaria" e nao invalidaria nada.
 *
 * ## O que NAO esta cacheado hoje
 *
 * Nenhuma leitura de dado clinico usa `use cache`. A listagem de pacientes le
 * sessao em cookie e `searchParams`, e `use cache` proibe as duas (o caminho
 * seria `use cache: private`, que exige contrato proprio). Esta fatia entrega a
 * fabrica e o cano de invalidacao no `createAction`; a primeira leitura cacheavel
 * tenant-scoped e outra fatia. Ver docs/06-acoes-e-auditoria.md §8.
 *
 * Limites do Next: 128 tags por chamada de `cacheTag()`, 256 caracteres por tag
 * (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cacheTag.md).
 * O formato daqui usa no maximo 88.
 */

/**
 * Tag de cache valida — sempre com `clinic_id`, sempre vinda desta fabrica.
 *
 * A marca so existe no tipo: em runtime e uma string comum, que e o que
 * `cacheTag`/`updateTag` recebem.
 */
export type CacheTag = string & { readonly __cacheTag: unique symbol }

/**
 * Entrada recusada pela fabrica.
 *
 * **Nunca carrega o valor recusado.** Se o motivo da recusa foi ser dado pessoal,
 * repeti-lo na mensagem publicaria no log o que a recusa existe para evitar.
 */
export class InvalidCacheTagError extends Error {
  constructor(
    /** Nome do parametro recusado — 'clinicId', 'patientId', 'date'. */
    readonly parameter: string,
    reason: string,
  ) {
    super(`Tag de cache invalida: ${parameter} ${reason}.`)
    this.name = 'InvalidCacheTagError'
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Identificador opaco vindo do banco (`uuid`), normalizado.
 *
 * `clinicId` sai de `current_clinic_id()`; `patientId`, da linha que o
 * repositorio devolveu. Os dois sao `uuid` no schema — exigir o formato aqui e
 * afirmar em codigo que so identificador opaco vira tag.
 */
function identifier(parameter: string, value: unknown): string {
  if (typeof value !== 'string') {
    throw new InvalidCacheTagError(parameter, 'precisa ser string')
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new InvalidCacheTagError(parameter, 'nao pode ser vazio')
  }

  const normalized = trimmed.toLowerCase()
  if (!UUID.test(normalized)) {
    // A mensagem diz o formato esperado, nunca o valor recebido.
    throw new InvalidCacheTagError(
      parameter,
      'precisa ser um UUID — identificador de banco, nunca nome, e-mail ou documento',
    )
  }

  return normalized
}

/**
 * Data civil `YYYY-MM-DD`, sem hora e sem fuso.
 *
 * A agenda e recortada por dia do calendario da clinica; carimbo com fuso viraria
 * duas tags para o mesmo dia. A checagem de calendario usa `Date.UTC`, que e
 * funcao pura — nada aqui le o relogio, entao a fabrica continua chamavel de
 * dentro de um escopo `use cache`.
 */
function civilDate(parameter: string, value: unknown): string {
  if (typeof value !== 'string') {
    throw new InvalidCacheTagError(parameter, 'precisa ser string')
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new InvalidCacheTagError(parameter, 'nao pode ser vazio')
  }

  const match = ISO_DATE.exec(trimmed)
  if (!match) {
    throw new InvalidCacheTagError(parameter, 'precisa estar em YYYY-MM-DD')
  }

  const utc = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  )

  // `Date.UTC(2026, 1, 31)` vira 03/03: sem o ida-e-volta, 2026-02-31 passaria.
  if (utc.toISOString().slice(0, 10) !== trimmed) {
    throw new InvalidCacheTagError(parameter, 'nao e uma data do calendario')
  }

  return trimmed
}

function clinicScoped(clinicId: string, ...rest: readonly string[]): CacheTag {
  return ['clinic', clinicId, ...rest].join(':') as CacheTag
}

/**
 * As tags do produto. Uma entrada por recorte que alguem precisa invalidar.
 *
 * Cada funcao valida a entrada e lanca `InvalidCacheTagError` — tag errada nao
 * degrada em silencio para "tag sem clinica".
 */
export const cacheTags = {
  /** Listagem, contagens e metricas de pacientes de uma clinica. */
  patients: (clinicId: string): CacheTag =>
    clinicScoped(identifier('clinicId', clinicId), 'patients'),

  /** Um paciente especifico. Invalidado junto de `patients` em toda escrita. */
  patient: (clinicId: string, patientId: string): CacheTag =>
    clinicScoped(
      identifier('clinicId', clinicId),
      'patient',
      identifier('patientId', patientId),
    ),

  /** A agenda de um dia do calendario da clinica (`YYYY-MM-DD`). */
  agenda: (clinicId: string, date: string): CacheTag =>
    clinicScoped(identifier('clinicId', clinicId), 'agenda', civilDate('date', date)),
} as const
