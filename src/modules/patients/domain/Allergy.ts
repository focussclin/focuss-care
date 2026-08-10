/**
 * Alergias do paciente — dado clínico de segurança.
 *
 * # O que esta camada NÃO grava, e por quê
 *
 * `allergies.severity` é `integer` nullable e **não tem convenção verificável
 * neste ambiente**: pode ser 1–3, 1–5, 0–10, e pode crescer para cima ou para
 * baixo. É o mesmo bloqueio de `work_schedules.weekday` (P-WD), com uma
 * consequência pior: uma alergia gravada como "leve" quando a escala do banco
 * dizia "grave" é exatamente a informação que alguém confere antes de aplicar
 * um medicamento.
 *
 * A coluna fica intocada — nula em tudo que a aplicação escreve, e ignorada na
 * leitura. `reaction` carrega a descrição em texto livre, que é o que a clínica
 * precisa ler para decidir, e não depende de escala nenhuma.
 *
 * # Por que não existe exclusão
 *
 * Uma alergia registrada por engano continua sendo história clínica: alguém
 * afirmou, em algum momento, que aquele paciente reagia àquela substância, e
 * decisões podem ter sido tomadas com base nisso. Apagar a linha apaga o
 * registro de que a informação existiu.
 *
 * `is_active` resolve: a alergia sai da lista de atenção e permanece no
 * histórico, com `recorded_by` dizendo quem a registrou.
 */

export interface Allergy {
  id: string
  patientId: string
  substance: string
  reaction: string | null
  isActive: boolean
  recordedBy: string | null
  recordedAt: Date
}

export interface NewAllergyData {
  patientId: string
  substance: string
  reaction: string | null
}

export interface AllergyUpdateData {
  substance: string
  reaction: string | null
}

/**
 * Duas entradas para a mesma substância são um perigo, não uma duplicata boba.
 *
 * "Dipirona — urticária" e "dipirona — choque anafilático" na mesma ficha
 * deixam quem lê sem saber qual vale, e a leitura apressada pega a primeira.
 * A comparação ignora caixa e espaço porque é assim que a digitação varia.
 *
 * Reativar a entrada existente é melhor do que criar a segunda: preserva
 * `recorded_by` e a data do registro original.
 */
export function normalizeSubstance(substance: string): string {
  return substance.trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ')
}

export function findSameSubstance(
  allergies: readonly Allergy[],
  substance: string,
): Allergy | null {
  const target = normalizeSubstance(substance)
  return allergies.find((entry) => normalizeSubstance(entry.substance) === target) ?? null
}

/**
 * Ativas primeiro, e as mais recentes no topo de cada grupo.
 *
 * Genéricas sobre a forma mínima de propósito: o domínio guarda `Date` e o DTO
 * guarda ISO, e a regra de ordenação é a mesma nos dois. Especializar em
 * `Allergy` obrigaria a tela a converter cada item só para ordenar — conversão
 * que existe apenas para satisfazer o tipo, e que some com um `cast` na
 * primeira pressa.
 */
interface Sortable {
  isActive: boolean
  recordedAt: Date | string
}

function timeOf(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

export function sortForChart<T extends Sortable>(allergies: readonly T[]): T[] {
  return [...allergies].sort((left, right) => {
    if (left.isActive !== right.isActive) return left.isActive ? -1 : 1
    return timeOf(right.recordedAt) - timeOf(left.recordedAt)
  })
}

export function activeAllergies<T extends { isActive: boolean }>(
  allergies: readonly T[],
): T[] {
  return allergies.filter((entry) => entry.isActive)
}
