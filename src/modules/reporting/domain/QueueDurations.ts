/**
 * Os tempos da fila de espera — feature **T-02**.
 *
 * # O que estava medido e nunca era lido
 *
 * `waiting_queue` guarda quatro carimbos, todos escritos pelo servidor:
 * `arrived_at` (check-in), `called_at` (chamada), `started_at` (início) e
 * `finished_at` (encerramento). O relógio do navegador da recepção nunca decidiu
 * nenhum deles — foi decisão de E-01, e é ela que torna esta medição confiável.
 *
 * A porta do relatório declarava a ausência por escrito: *"tempo médio de espera
 * seria derivável de `waiting_queue`, e entra quando houver volume suficiente
 * para a média significar alguma coisa"*. O volume não é uma condição que o
 * código possa esperar acontecer sozinha — é uma informação que a tela precisa
 * mostrar junto do número. É o que esta fatia faz.
 *
 * # Mediana, e não média
 *
 * Uma pessoa que chegou três horas adiantada e sentou na recepção destrói a
 * média do dia inteiro. A mediana descreve o que aconteceu com a maioria, que é
 * a pergunta real de quem gerencia a sala de espera: "quanto tempo alguém espera
 * aqui, normalmente?".
 *
 * A **maior espera** entra ao lado dela de propósito. Não é estatística: é um
 * evento que aconteceu com uma pessoa, e é o número que revela o dia ruim que a
 * mediana esconde.
 */

/**
 * Abaixo disto, a mediana é ruído — e a tela diz isso em vez de escondê-la.
 *
 * Cinco é baixo de propósito. O objetivo não é ter certeza estatística: é
 * impedir que uma clínica leia "espera típica: 2 minutos" apoiada em duas
 * chegadas de um período inteiro.
 */
export const MIN_QUEUE_SAMPLE = 5

/** Uma passagem pela fila, já reduzida ao que interessa medir. */
export interface QueueVisit {
  arrivedAt: Date
  /** Null enquanto ninguém chamou — quem ainda espera não tem espera final. */
  calledAt: Date | null
  startedAt: Date | null
  finishedAt: Date | null
}

export interface QueueDuration {
  /** Quantas passagens entraram na conta. */
  sample: number
  /** Minutos — a metade da amostra esperou menos que isto. */
  medianMinutes: number
  /** Minutos da pior ocorrência observada. */
  maxMinutes: number
}

export interface QueueTimes {
  /** Chegada → chamada. Null quando ninguém foi chamado no período. */
  waiting: QueueDuration | null
  /** Início → encerramento. Null quando nenhum atendimento foi encerrado. */
  service: QueueDuration | null
  /**
   * Passagens do período que ainda não tinham sido chamadas na leitura.
   *
   * Não são falha nem erro: são pessoas na sala de espera agora. Elas ficam de
   * fora da mediana porque a espera **delas ainda não terminou** — contá-las com
   * o tempo até agora faria a espera do período encolher toda vez que a página
   * fosse aberta, e contá-las como zero seria pior.
   */
  stillWaiting: number
  /** A leitura bateu no teto de linhas do relatório e pode ser parcial. */
  truncated: boolean
}

/**
 * Diferença em minutos, ou `null` quando não há o que medir.
 *
 * Duração negativa é descartada. Os dois carimbos saem do relógio do servidor,
 * então ela não deveria existir — mas uma linha corrigida à mão no banco faria a
 * mediana despencar sem que ninguém entendesse por quê, e um número impossível
 * merece sumir da conta, não ser corrigido para zero.
 */
export function durationMinutes(from: Date, to: Date | null): number | null {
  if (!to) return null

  const minutes = (to.getTime() - from.getTime()) / 60_000

  return minutes < 0 ? null : Math.round(minutes)
}

/**
 * A mediana de verdade: com amostra par, é a média dos dois centrais.
 *
 * Pegar só o elemento de baixo é o atalho comum e desloca o número para baixo
 * justamente nas amostras pequenas, que são as que esta tela mais mostra.
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0

  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 1) return sorted[middle]

  return Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

function summarize(values: readonly number[]): QueueDuration | null {
  if (values.length === 0) return null

  return {
    sample: values.length,
    medianMinutes: median(values),
    maxMinutes: Math.max(...values),
  }
}

/**
 * As passagens do período viram os dois tempos que a clínica lê.
 *
 * **Só quem foi chamado entra na espera**, e só quem foi encerrado entra na
 * duração. As duas listas têm tamanhos diferentes de propósito: um atendimento
 * em curso já foi chamado e ainda não terminou, e forçá-lo a aparecer nas duas
 * contas exigiria inventar um fim que não aconteceu.
 */
export function summarizeQueueTimes(
  visits: readonly QueueVisit[],
): QueueTimes {
  const waiting: number[] = []
  const service: number[] = []
  let stillWaiting = 0

  for (const visit of visits) {
    const wait = durationMinutes(visit.arrivedAt, visit.calledAt)
    if (wait === null) {
      if (!visit.calledAt) stillWaiting += 1
      continue
    }

    waiting.push(wait)
  }

  for (const visit of visits) {
    if (!visit.startedAt) continue

    const duration = durationMinutes(visit.startedAt, visit.finishedAt)
    if (duration !== null) service.push(duration)
  }

  return {
    waiting: summarize(waiting),
    service: summarize(service),
    stillWaiting,
    truncated: false,
  }
}

/** A amostra sustenta a leitura, ou o número é anedota? */
export function isRepresentative(duration: QueueDuration | null): boolean {
  return duration !== null && duration.sample >= MIN_QUEUE_SAMPLE
}

/** "1 h 25 min", "8 min" — o formato que a tela mostra. */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}
