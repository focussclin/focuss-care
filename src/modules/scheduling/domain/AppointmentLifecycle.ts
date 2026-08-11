import type { AppointmentStatus } from '@/modules/_shared/domain/types'

/**
 * O ciclo de vida do atendimento — feature **A-03**.
 *
 * # O que estava quebrado
 *
 * `appointment_status` tem sete valores. A aplicação criava a linha em
 * `scheduled` ou `confirmed` e só sabia escrever **um** outro: `canceled`. Um
 * atendimento marcado permanecia marcado para sempre, mesmo depois de
 * acontecer, e as consequências não eram cosméticas:
 *
 *  - **A taxa de comparecimento não existia.** `/indicadores` e `/relatorios`
 *    calculam `completed / (completed + no_show)` lendo `appointments.status`.
 *    Nenhum dos dois era gravado, então a métrica ficava nula para sempre — e o
 *    alerta de absenteísmo de `operationalInsights` nunca podia disparar.
 *  - **Falta prendia o horário.** O banco já trata `canceled` e `no_show` como
 *    liberadores de vaga (`RELEASES_SLOT`), mas sem caminho para registrar a
 *    falta o horário de quem não veio continuava ocupado.
 *  - **Confirmar só era possível ao criar**, que é o avesso da rotina: a
 *    clínica marca hoje e confirma na véspera.
 *
 * # Por que uma máquina de estados, e não três `if`
 *
 * Cada transição tem uma pergunta diferente sobre o estado anterior, e escrevê-las
 * espalhadas pelas actions é como elas passam a discordar. Aqui a regra é uma só,
 * testável sem banco, e o adapter a aplica como condição do `UPDATE` — o que
 * fecha a corrida entre duas recepcionistas clicando ao mesmo tempo.
 */

/**
 * O que o atendimento virou depois da hora marcada.
 *
 * São os dois desfechos que a agenda registra, e são mutuamente exclusivos: ou
 * a pessoa veio, ou não veio. É este par que alimenta a taxa de comparecimento.
 */
export const APPOINTMENT_OUTCOMES = ['completed', 'no_show'] as const
export type AppointmentOutcome = (typeof APPOINTMENT_OUTCOMES)[number]

export function isAppointmentOutcome(value: string): value is AppointmentOutcome {
  return (APPOINTMENT_OUTCOMES as readonly string[]).includes(value)
}

/**
 * Estados a partir dos quais nada mais muda.
 *
 * `completed` e `no_show` são desfecho registrado; `canceled` é o que a agenda
 * já tratava assim. Reabrir qualquer um deles reescreveria a história do que a
 * clínica afirmou ter acontecido.
 */
const TERMINAL: readonly AppointmentStatus[] = ['completed', 'canceled', 'no_show']

export function isTerminal(status: AppointmentStatus): boolean {
  return TERMINAL.includes(status)
}

/**
 * O andamento da visita — os dois estados que a FILA move.
 *
 * `checked_in` e `in_progress` existem no enum do banco desde o primeiro schema
 * e eram **inalcançáveis**: quem move o paciente pela fila é o módulo de
 * atendimento (chegada, chamada, início), e ele não tocava em
 * `appointments.status`. O efeito prático era a agenda dizer "Agendado" sobre
 * alguém que já estava na sala — duas telas afirmando coisas diferentes sobre a
 * mesma pessoa no mesmo minuto.
 *
 * Não são desfecho: dizem ONDE a visita está, não como ela terminou. Por isso
 * ficam fora de `APPOINTMENT_OUTCOMES` e não entram na taxa de comparecimento.
 */
export const APPOINTMENT_PROGRESS = ['checked_in', 'in_progress'] as const
export type AppointmentProgress = (typeof APPOINTMENT_PROGRESS)[number]

export function isAppointmentProgress(
  value: string,
): value is AppointmentProgress {
  return (APPOINTMENT_PROGRESS as readonly string[]).includes(value)
}

/**
 * Chegada sai do que ainda não começou.
 *
 * `confirmed` entra porque confirmar e chegar são coisas diferentes, e
 * `scheduled` também: a clínica que não usa confirmação recebe o paciente
 * direto — a mesma razão pela qual `scheduled` está em `OUTCOME_FROM`.
 */
export const CHECK_IN_FROM: readonly AppointmentStatus[] = [
  'scheduled',
  'confirmed',
]

export function canCheckIn(status: AppointmentStatus): boolean {
  return CHECK_IN_FROM.includes(status)
}

/**
 * Início sai de qualquer estado anterior ao atendimento — inclusive `scheduled`.
 *
 * Parece frouxo e é deliberado: quando o atendimento começa, a pessoa está na
 * sala, e isso é fato observado. Exigir a passagem por `checked_in` faria a
 * agenda ficar presa em "Agendado" sempre que a chegada não tivesse sido
 * carimbada — inclusive nos atendimentos criados antes desta fatia, que é a base
 * inteira. A regra é auto-corretiva de propósito.
 */
export const IN_PROGRESS_FROM: readonly AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'checked_in',
]

export function canStart(status: AppointmentStatus): boolean {
  return IN_PROGRESS_FROM.includes(status)
}

/**
 * Confirmar sai de `scheduled`, e de mais lugar nenhum.
 *
 * Já confirmado não reconfirma — não é erro do usuário, é ausência de efeito, e
 * a tela some com o botão em vez de oferecer um clique que não faz nada.
 * Depois da chegada, confirmar seria andar para trás.
 */
export const CONFIRMABLE_FROM: readonly AppointmentStatus[] = ['scheduled']

export function canConfirm(status: AppointmentStatus): boolean {
  return CONFIRMABLE_FROM.includes(status)
}

/**
 * Desfecho sai de qualquer estado ANTES do fim.
 *
 * Inclui `scheduled`: a clínica que não usa confirmação marca e atende, e
 * exigir a confirmação como degrau obrigatório inventaria uma etapa que aquela
 * operação não tem. Inclui `checked_in` e `in_progress` porque a fila de espera
 * é outro caminho para o mesmo atendimento.
 */
export const OUTCOME_FROM: readonly AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'checked_in',
  'in_progress',
]

export function canRecordOutcome(status: AppointmentStatus): boolean {
  return OUTCOME_FROM.includes(status)
}

/**
 * Desfecho só depois da hora marcada.
 *
 * Registrar falta para amanhã não é registro, é adivinhação — e entraria na
 * taxa de comparecimento como se fosse fato observado. O corte é o INÍCIO do
 * atendimento, não o fim: quem não chegou na hora já faltou, e esperar o
 * horário terminar só atrasaria a liberação da vaga.
 */
export function outcomeIsDue(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() <= now.getTime()
}

/**
 * A transição é permitida?
 *
 * Existe para o adapter e para o teste dizerem a mesma coisa; a UI usa os
 * predicados nomeados, que leem melhor no lugar onde o botão é decidido.
 */
export function canTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  if (from === to) return false
  if (isTerminal(from)) return false
  if (to === 'confirmed') return canConfirm(from)
  if (to === 'checked_in') return canCheckIn(from)
  if (to === 'in_progress') return canStart(from)
  if (isAppointmentOutcome(to)) return canRecordOutcome(from)
  return false
}

/**
 * De onde uma transição pode partir — a lista que vira condição do `UPDATE`.
 *
 * O adapter passa isto para o `WHERE`, e não confere em memória: entre ler o
 * status e escrever o novo há espaço para outra pessoa mudar o mesmo
 * atendimento, e é a condição no banco que decide quem chegou primeiro.
 */
export function allowedSourcesFor(
  to: AppointmentStatus,
): readonly AppointmentStatus[] {
  if (to === 'confirmed') return CONFIRMABLE_FROM
  if (to === 'checked_in') return CHECK_IN_FROM
  if (to === 'in_progress') return IN_PROGRESS_FROM
  if (isAppointmentOutcome(to)) return OUTCOME_FROM
  return []
}
