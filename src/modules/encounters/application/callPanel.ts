import type { QueueEntry } from '../domain/Encounter'

/**
 * O que a TV da sala de espera mostra.
 *
 * # A decisão que manda neste arquivo: o nome é ABREVIADO
 *
 * Esta tela fica numa parede, visível para todo mundo que está esperando — e
 * para quem só passou na recepção. Um painel que escreve "Maria Aparecida da
 * Silva" conta, para uma sala inteira de estranhos, que aquela pessoa está numa
 * clínica hoje. Em clínica, a simples presença já é dado de saúde por
 * associação (LGPD art. 5º, II): numa clínica de oncologia ou de psiquiatria, o
 * nome completo na parede é o diagnóstico.
 *
 * Por isso o painel mostra **primeiro nome + iniciais** — "Maria A. S." —, que é
 * a prática das clínicas e continua servindo para a pessoa se reconhecer quando
 * ouve a chamada. O nome completo continua existindo em `/atendimentos`, que é
 * tela de trabalho e exige `encounter.read`.
 *
 * O que **não** vai para a parede, e o motivo de cada um:
 *
 * - `reason` — motivo declarado na chegada. É o mais próximo de queixa clínica
 *   que a fila guarda, e não tem por que ser lido pela sala.
 * - `patientId` e `appointmentId` — identificadores não ajudam ninguém a saber
 *   se é a sua vez, e num painel público são superfície de graça.
 */

export interface CallPanelEntry {
  id: string
  /** Nome abreviado — ver o porquê no topo do arquivo. */
  displayName: string
  /** Onde a pessoa deve ir. Null quando a recepção ainda não definiu. */
  professionalName: string | null
  calledAt: Date | null
}

export interface CallPanel {
  /** Quem está sendo chamado agora. Null quando ninguém foi chamado. */
  nowCalling: CallPanelEntry | null
  /** Chamados anteriores, do mais recente para o mais antigo. */
  previousCalls: readonly CallPanelEntry[]
  /** Quantas pessoas ainda esperam. Número, e não nomes: quem espera não foi chamado. */
  waitingCount: number
}

/** Quantas chamadas anteriores continuam na tela. */
const PREVIOUS_CALLS_LIMIT = 3

/**
 * "Maria Aparecida da Silva" -> "Maria A. S."
 *
 * Partículas (`da`, `de`, `dos`…) somem em vez de virar "D.": elas não
 * identificam ninguém e só poluiriam a leitura à distância. Nome único fica
 * como está — abreviar "Madonna" para "Madonna" é o comportamento certo.
 */
export function abbreviateForPublicDisplay(fullName: string): string {
  const particles = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])

  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)

  if (parts.length === 0) return 'Paciente'

  const [first, ...rest] = parts
  const initials = rest
    .filter((part) => !particles.has(part.toLowerCase()))
    .map((part) => `${part[0].toUpperCase()}.`)

  return [first, ...initials].join(' ')
}

function toPanelEntry(entry: QueueEntry): CallPanelEntry {
  return {
    id: entry.id,
    displayName: abbreviateForPublicDisplay(entry.patientName),
    professionalName: entry.professionalName,
    calledAt: entry.calledAt,
  }
}

/**
 * Fila do dia -> o que aparece na parede.
 *
 * `called` é o estado que interessa: a pessoa foi chamada e ainda não entrou.
 * Quem já está `in_service` saiu da sala de espera, e quem está `waiting` não
 * foi chamado — mostrar qualquer um dos dois faria alguém levantar na hora
 * errada.
 *
 * A ordem é por `calledAt` decrescente, e não pela ordem da fila: o painel
 * responde "quem está sendo chamado AGORA", que é a última chamada feita.
 */
export function buildCallPanel(entries: readonly QueueEntry[]): CallPanel {
  const called = entries
    .filter((entry) => entry.status === 'called' && entry.calledAt !== null)
    .sort((a, b) => (b.calledAt?.getTime() ?? 0) - (a.calledAt?.getTime() ?? 0))

  const [current, ...previous] = called

  return {
    nowCalling: current ? toPanelEntry(current) : null,
    previousCalls: previous.slice(0, PREVIOUS_CALLS_LIMIT).map(toPanelEntry),
    waitingCount: entries.filter((entry) => entry.status === 'waiting').length,
  }
}
