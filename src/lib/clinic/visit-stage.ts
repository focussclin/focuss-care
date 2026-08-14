/**
 * Em que ponto do dia esta pessoa está — etapa 1 de `PAGAMENTO_ANTES_DA_CONSULTA.md`.
 *
 * # O problema que isto resolve
 *
 * O fluxo operacional que a clínica enxerga tem treze pontos ("aguardando
 * pagamento", "aguardando atendimento", "atendimento finalizado"…). O banco
 * guarda **três** máquinas de estado separadas, nenhuma delas com esses nomes:
 *
 * ```
 * appointments.status   scheduled | confirmed | checked_in | in_progress | completed | canceled | no_show
 * waiting_queue.status  waiting | called | in_service | done | abandoned
 * invoices.status       draft | issued | partially_paid | paid | overdue | canceled
 * ```
 *
 * Os enums são fechados no Postgres e migration está bloqueada. Então o ponto do
 * fluxo é **derivado**, não gravado — que é o que este produto já faz para
 * `expired` de guia, `divergente` de conciliação e nível de estoque, pelo mesmo
 * motivo: não há worker que mantivesse um status gravado coerente.
 *
 * # Por que em `lib/`, e não num módulo
 *
 * A derivação precisa de `scheduling`, `encounters` e `billing` ao mesmo tempo.
 * Pôr em qualquer um faria um módulo alcançar o interior dos outros dois — a
 * regra 4 da arquitetura. É o mesmo caminho de `reception-board.ts` e
 * `appointment-progress.ts`.
 *
 * As entradas são interfaces **próprias e mínimas**, não importadas dos módulos:
 * estruturalmente compatíveis com as entidades, sem criar dependência. Este
 * arquivo não deve saber o que mais existe em `Appointment` ou `Invoice`.
 *
 * # Sem I/O e sem relógio
 *
 * Função pura. Quem lê o banco é o chamador, e `overdue` não é decidido aqui —
 * a data de vencimento não muda o fato de haver saldo, que é o que o portão de
 * pagamento pergunta.
 */

/** O ponto do fluxo, no vocabulário da operação. */
export type VisitStage =
  | 'scheduled'
  | 'confirmed'
  /** Chegou, e ainda não se sabe de cobrança. */
  | 'checked-in'
  /** Chegou e deve o valor inteiro. */
  | 'awaiting-payment'
  /** Chegou, pagou parte, ainda deve. */
  | 'partially-paid'
  /** Sem saldo, mas ainda não entrou na fila de quem atende. */
  | 'paid'
  /** Liberado e esperando ser chamado. */
  | 'awaiting-service'
  | 'in-service'
  /** O atendimento fechou e sobrou cobrança — procedimento feito na hora. */
  | 'awaiting-extra-payment'
  | 'completed'
  | 'canceled'
  | 'no-show'

/**
 * O mínimo que a derivação precisa de um agendamento.
 *
 * `null` é **encaixe**: quem chegou sem hora marcada. Rotina de clínica, e não
 * ausência de dado.
 */
export interface VisitAppointment {
  /** `appointment_status`. */
  status: string
}

/** O mínimo que ela precisa de quem já está na clínica. */
export interface VisitQueueEntry {
  /** `queue_status`. */
  status: string
}

/** O mínimo que ela precisa de uma cobrança. */
export interface VisitCharge {
  /** `invoice_status`. */
  status: string
  totalCents: number
  paidCents: number
  /**
   * `payer_type`. Convênio não gera saldo de balcão: quem paga é a operadora,
   * pelo ciclo da guia, e travar o paciente por isso pararia a operação inteira
   * de quem atende convênio.
   */
  payerType: string
}

/** O mínimo que ela precisa do atendimento em si. */
export interface VisitEncounter {
  /** `encounter_status`. */
  status: string
}

export interface VisitInput {
  appointment: VisitAppointment | null
  queue: VisitQueueEntry | null
  encounter: VisitEncounter | null
  charges: readonly VisitCharge[]
}

/**
 * Cobrança cancelada não deve nada.
 *
 * **`draft` DEVE contar.** Aqui ele não significa rascunho: `createInvoice`
 * grava toda fatura como `draft` de propósito, porque `issued` alegaria um
 * documento fiscal numerado que a RPC bloqueada não emitiu. Tratar `draft` como
 * "ainda não cobrada" faria o portão de pagamento nunca disparar para nenhuma
 * fatura que este produto cria — que é a falha silenciosa mais cara possível
 * numa regra de bloqueio.
 */
const SETTLED = new Set(['canceled'])

/**
 * Quanto o PACIENTE ainda deve, em centavos.
 *
 * Some sempre pela diferença, e não pelo status: `partially_paid` e `paid` são
 * projeções de `payments`, e a projeção pode estar atrás do fato — o dinheiro é
 * a linha em `payments`, não o rótulo na fatura.
 *
 * Nunca negativo: pagamento acima do total é erro de outro lugar, e devolver
 * saldo negativo faria a soma de várias cobranças esconder uma dívida real.
 */
export function outstandingCents(charges: readonly VisitCharge[]): number {
  let total = 0

  for (const charge of charges) {
    if (SETTLED.has(charge.status)) continue
    if (charge.payerType === 'insurance') continue

    total += Math.max(0, charge.totalCents - charge.paidCents)
  }

  return total
}

/** Alguma coisa já foi paga nas cobranças que ainda valem? */
function hasPartialPayment(charges: readonly VisitCharge[]): boolean {
  return charges.some(
    (charge) =>
      !SETTLED.has(charge.status) &&
      charge.payerType !== 'insurance' &&
      charge.paidCents > 0,
  )
}

/** A pessoa está fisicamente na clínica? */
function hasArrived(input: VisitInput): boolean {
  if (input.queue) return true

  return (
    input.appointment?.status === 'checked_in' ||
    input.appointment?.status === 'in_progress'
  )
}

/**
 * O ponto do fluxo.
 *
 * # A ordem das perguntas É a regra
 *
 * Terminal primeiro, depois o que está acontecendo agora, e só então o
 * financeiro. Inverter faria um atendimento cancelado com fatura em aberto
 * aparecer como "aguardando pagamento" — cobrando na tela alguém que não vem.
 *
 * O financeiro vem antes de "aguardando atendimento" pelo motivo oposto, e é o
 * ponto do pedido: quem deve não pode figurar como liberado, mesmo já estando na
 * fila. A fila diz "está na clínica"; quem decide se pode ser chamado é isto.
 */
export function resolveVisitStage(input: VisitInput): VisitStage {
  if (input.appointment?.status === 'canceled') return 'canceled'
  if (input.appointment?.status === 'no_show') return 'no-show'

  const outstanding = outstandingCents(input.charges)

  /*
   * Atendimento encerrado — e é aqui que a cobrança adicional aparece.
   *
   * O procedimento feito durante a consulta vira fatura nova depois de o
   * paciente já ter pago a consulta. A regra de pagamento antecipado não pode
   * impedir isso: ela vale para ENTRAR, não para sair.
   */
  const finished =
    input.encounter?.status === 'closed' ||
    input.appointment?.status === 'completed' ||
    input.queue?.status === 'done'

  if (finished) {
    return outstanding > 0 ? 'awaiting-extra-payment' : 'completed'
  }

  if (
    input.queue?.status === 'in_service' ||
    input.appointment?.status === 'in_progress'
  ) {
    return 'in-service'
  }

  if (!hasArrived(input)) {
    return input.appointment?.status === 'confirmed' ? 'confirmed' : 'scheduled'
  }

  if (outstanding > 0) {
    return hasPartialPayment(input.charges) ? 'partially-paid' : 'awaiting-payment'
  }

  /*
   * Sem saldo. `checked-in` e não `paid` quando não há cobrança nenhuma: dizer
   * "pago" sobre quem nunca teve fatura afirmaria um pagamento que não houve, e
   * a recepção leria isso como conferência feita.
   */
  if (input.charges.length === 0) {
    return input.queue ? 'awaiting-service' : 'checked-in'
  }

  return input.queue ? 'awaiting-service' : 'paid'
}

/**
 * A pergunta que o portão de pagamento fará na etapa 6.
 *
 * Separada de propósito: `resolveVisitStage` é para a TELA, e um rótulo não
 * pode virar regra de bloqueio por acidente. Aqui o critério é um só — há saldo
 * de paciente? — e é ele que `call` e `start` vão consultar.
 */
export function blocksService(charges: readonly VisitCharge[]): boolean {
  return outstandingCents(charges) > 0
}
