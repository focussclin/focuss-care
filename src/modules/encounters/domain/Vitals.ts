/**
 * Sinais vitais — a medida, e nada além dela.
 *
 * # Toda coluna traz a unidade no nome
 *
 * `weight_kg`, `height_cm`, `temperature_c`, `glucose_mgdl`. Pressão em mmHg,
 * frequências por minuto, saturação em porcentagem — universais. **Não há
 * convenção a adivinhar aqui**, e foi o que permitiu escrever esta fatia por
 * inteiro, ao contrário de `allergies.severity` e `work_schedules.weekday`.
 *
 * # A tabela é append-only, e a aplicação respeita
 *
 * `vitals` não tem `updated_at` nem `deleted_at`. É uma medida feita em um
 * instante: corrigir não é sobrescrever, é registrar de novo. Por isso não
 * existe edição nem exclusão em lugar nenhum deste módulo — a ausência é o
 * desenho do schema, não uma funcionalidade faltando.
 *
 * # Nenhum valor é classificado como normal ou alterado
 *
 * Faixa de referência depende de idade, condição e diretriz: a pressão "alta"
 * de um adulto é outra na criança, e a saturação aceitável de um paciente com
 * DPOC não é a da população geral. Pintar um número de vermelho seria emitir um
 * julgamento clínico que este código não tem como fazer — e, pior, um que
 * pareceria oficial. A tela mostra o número com a unidade; a leitura é de quem
 * atende.
 */

export interface VitalsEntry {
  id: string
  patientId: string
  encounterId: string | null
  measuredAt: Date
  weightKg: number | null
  heightCm: number | null
  systolicBp: number | null
  diastolicBp: number | null
  heartRate: number | null
  respiratoryRate: number | null
  temperatureC: number | null
  spo2: number | null
  glucoseMgdl: number | null
  notes: string | null
}

export interface NewVitalsData {
  patientId: string
  encounterId: string | null
  measuredAt: Date
  weightKg: number | null
  heightCm: number | null
  systolicBp: number | null
  diastolicBp: number | null
  heartRate: number | null
  respiratoryRate: number | null
  temperatureC: number | null
  spo2: number | null
  glucoseMgdl: number | null
  notes: string | null
}

/** Os nove campos de medida. `notes` não conta: observação não é medida. */
const MEASUREMENT_KEYS = [
  'weightKg',
  'heightCm',
  'systolicBp',
  'diastolicBp',
  'heartRate',
  'respiratoryRate',
  'temperatureC',
  'spo2',
  'glucoseMgdl',
] as const

type Measurements = Pick<NewVitalsData, (typeof MEASUREMENT_KEYS)[number]>

/**
 * Um registro sem nenhuma medida é uma linha vazia com carimbo de hora.
 *
 * Ela apareceria no histórico como "aferição realizada" sem nada aferido — o
 * tipo de registro que faz alguém concluir que a medida foi feita e deu normal.
 */
export function hasAnyMeasurement(data: Measurements): boolean {
  return MEASUREMENT_KEYS.some((key) => data[key] !== null)
}

/**
 * Pressão precisa dos dois valores, ou de nenhum.
 *
 * "120 por nada" não é uma pressão arterial: sozinha, a sistólica não permite
 * calcular a média nem avaliar a diferencial. Aceitar metade gravaria um dado
 * que ninguém consegue usar e que parece completo na listagem.
 */
export function bloodPressureIsComplete(
  systolic: number | null,
  diastolic: number | null,
): boolean {
  return (systolic === null) === (diastolic === null)
}

/**
 * A diastólica precisa ser menor que a sistólica.
 *
 * Invertidas é erro de digitação — e um erro que passa despercebido, porque os
 * dois números são plausíveis isolados.
 */
export function bloodPressureIsOrdered(
  systolic: number | null,
  diastolic: number | null,
): boolean {
  if (systolic === null || diastolic === null) return true
  return diastolic < systolic
}

/**
 * IMC, quando há peso e altura na MESMA aferição.
 *
 * A conta é exata — `kg / m²` — e por isso pode ser mostrada. O que não é
 * mostrado é a faixa: "sobrepeso" e "obesidade grau I" são classificações que
 * não valem para criança, atleta ou gestante, e exibi-las ao lado do número as
 * faria parecer parte da medida.
 *
 * Não combina peso de hoje com altura de seis meses atrás: seriam duas
 * aferições diferentes tratadas como uma.
 */
export function bmiFrom(weightKg: number | null, heightCm: number | null): number | null {
  if (weightKg === null || heightCm === null || heightCm <= 0) return null
  const meters = heightCm / 100
  return Math.round((weightKg / (meters * meters)) * 10) / 10
}

/** Mais recentes primeiro — a última aferição é a que interessa. */
export function sortByMeasuredAt<T extends { measuredAt: Date | string }>(
  entries: readonly T[],
): T[] {
  const time = (value: Date | string) =>
    value instanceof Date ? value.getTime() : new Date(value).getTime()
  return [...entries].sort((left, right) => time(right.measuredAt) - time(left.measuredAt))
}

export function latestOf<T extends { measuredAt: Date | string }>(
  entries: readonly T[],
): T | null {
  return sortByMeasuredAt(entries)[0] ?? null
}
