/**
 * Prescrições — o que o profissional prescreveu, como texto.
 *
 * # O que esta camada NÃO faz, e a lista é a parte importante
 *
 * Não assina, não valida receita perante conselho ou vigilância, não imprime,
 * não gera PDF, não fala com provedor de assinatura e **não interpreta dose**.
 * `dosage`, `route`, `frequency`, `duration` e `quantity` são `text` no banco e
 * texto livre aqui: "500 mg", "1 comprimido", "de 8 em 8 horas". A aplicação
 * guarda o que o profissional escreveu e devolve igual.
 *
 * Conferir se a dose é adequada, se há interação, se a via combina com a
 * apresentação — nada disso acontece aqui, e a ausência é deliberada. Um
 * produto que valida dose está dando parecer clínico; este guarda registro.
 *
 * # Quatro colunas são de um sistema que não existe
 *
 * `signed_at`, `signature`, `external_id` e `external_url` pertencem a um
 * emissor de receita com assinatura digital — ICP-Brasil, Memed, o que for. Não
 * há adapter, e a aplicação **lê e nunca escreve** as quatro. Preencher
 * `signed_at` sem assinatura real seria afirmar que a receita foi assinada: a
 * mentira mais cara que este módulo poderia contar.
 *
 * # Append-only, como o prontuário
 *
 * Nem `prescriptions` nem `prescription_items` têm `updated_at` ou
 * `deleted_at`. Prescrição corrigida é prescrição nova — a anterior é o que o
 * paciente levou na mão, e apagá-la apagaria o que foi orientado.
 */

export interface PrescriptionItem {
  id: string
  drugName: string
  dosage: string | null
  route: string | null
  frequency: string | null
  duration: string | null
  quantity: string | null
  instructions: string | null
  sortOrder: number
}

export interface Prescription {
  id: string
  patientId: string
  encounterId: string | null
  /** `professionals.id` — quem tem conselho e responsabilidade clínica. */
  authorId: string
  authorName: string | null
  issuedAt: Date
  validUntil: Date | null
  /** Do emissor externo. A aplicação lê e nunca grava. */
  signedAt: Date | null
  /** Do emissor externo. A aplicação lê e nunca grava. */
  externalUrl: string | null
  items: readonly PrescriptionItem[]
}

export interface NewPrescriptionItemData {
  drugName: string
  dosage: string | null
  route: string | null
  frequency: string | null
  duration: string | null
  quantity: string | null
  instructions: string | null
}

export interface NewPrescriptionData {
  patientId: string
  encounterId: string | null
  validUntil: Date | null
  items: readonly NewPrescriptionItemData[]
}

export const MAX_ITEMS = 30

/**
 * Prescrição sem item é receita em branco.
 *
 * Ela apareceria no histórico como "prescrição emitida" sem nada prescrito — o
 * tipo de registro que faz alguém concluir que houve orientação.
 */
export function hasAnyItem(items: readonly { drugName: string }[]): boolean {
  return items.length > 0
}

/**
 * A ordem dos itens é a que o profissional escreveu.
 *
 * `sort_order` existe para isso: a sequência de uma receita não é alfabética
 * nem cronológica, é a que quem prescreveu escolheu — e o paciente lê nela.
 */
export function orderItems<T extends { sortOrder: number }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.sortOrder - right.sortOrder)
}

/** Mais recentes primeiro: a última prescrição é a que vale hoje. */
export function sortByIssuedAt<T extends { issuedAt: Date | string }>(
  prescriptions: readonly T[],
): T[] {
  const time = (value: Date | string) =>
    value instanceof Date ? value.getTime() : new Date(value).getTime()
  return [...prescriptions].sort((left, right) => time(right.issuedAt) - time(left.issuedAt))
}

/**
 * A receita passou da validade?
 *
 * Comparação de data, e nada além disso. **Não** é julgamento sobre continuar
 * ou suspender tratamento: uma receita vencida pode estar sendo seguida com
 * razão, e uma dentro do prazo pode ter sido suspensa na consulta seguinte. A
 * tela mostra o fato; a conduta é de quem atende.
 *
 * Sem `valid_until` não há vencimento a afirmar — devolve `false`, não "válida
 * para sempre".
 */
export function isExpired(validUntil: Date | null, now: Date): boolean {
  if (validUntil === null) return false
  return validUntil.getTime() < now.getTime()
}
