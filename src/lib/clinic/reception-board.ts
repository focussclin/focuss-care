/**
 * O quadro da recepção: quem chegou, quem falta chegar, e quem está atrasado.
 *
 * # Por que isto mora em `lib/`, e não num módulo
 *
 * A derivação precisa da AGENDA (`scheduling`) e da FILA (`encounters`) ao mesmo
 * tempo. Colocá-la em qualquer um dos dois faria um módulo alcançar o interior
 * do outro, que é a regra 4 da arquitetura. É o mesmo caminho já usado por
 * `business-hours.ts` e `patientRoutes.ts`: o que os dois compartilham desce
 * para `lib/`, e a rota compõe.
 *
 * As entradas são descritas por interfaces PRÓPRIAS e mínimas, e não importadas
 * dos módulos. Estruturalmente compatíveis com `Appointment` e `QueueEntry`, mas
 * sem criar dependência — este arquivo não deve saber o que mais existe nas duas
 * entidades.
 *
 * # A pergunta que ele responde, e que nenhuma tela respondia
 *
 * `/agenda` mostra quem tem hora marcada. `/atendimentos` mostra quem está na
 * fila. **Ninguém respondia "quem deveria ter chegado às 14h e não apareceu?"** —
 * e essa é a pergunta que faz a recepção pegar o telefone.
 */

/** O mínimo que o quadro precisa saber de um horário marcado. */
export interface ScheduledSlot {
  id: string
  patientName: string
  professionalName: string
  startsAt: Date
  status: string
}

/** O mínimo que ele precisa saber de quem já está na clínica. */
export interface ArrivedEntry {
  /** Null em encaixe: chegou sem hora marcada. */
  appointmentId: string | null
}

export interface ReceptionSlot {
  id: string
  patientName: string
  professionalName: string
  startsAt: Date
  /** Minutos de atraso, contados do horário marcado. Zero quando ainda não passou. */
  lateMinutes: number
}

export interface ReceptionBoard {
  /** Hora marcada já passou e a pessoa não deu entrada. */
  late: readonly ReceptionSlot[]
  /** Ainda vai acontecer, e a pessoa não chegou. */
  expected: readonly ReceptionSlot[]
  /** Quantos já deram entrada — a fila em si vive em `/atendimentos`. */
  arrivedCount: number
}

/**
 * Status que não esperam ninguém na porta.
 *
 * `checked_in` e `in_progress` já estão dentro; `completed` foi embora;
 * `canceled` e `no_show` não vêm. Sobram `scheduled` e `confirmed`, que são
 * exatamente as pessoas que a recepção ainda aguarda.
 */
const AWAITING_ARRIVAL = new Set(['scheduled', 'confirmed'])

/**
 * Tolerância antes de chamar alguém de atrasado.
 *
 * Cinco minutos porque "atrasado" na tela dispara ligação, e ligar para quem
 * está estacionando o carro gasta a paciência da recepção e a do paciente.
 */
const LATE_TOLERANCE_MINUTES = 5

const MINUTE_MS = 60_000

export function buildReceptionBoard(
  slots: readonly ScheduledSlot[],
  arrived: readonly ArrivedEntry[],
  now: Date,
): ReceptionBoard {
  /*
   * Quem já deu entrada é reconhecido pelo `appointmentId` da fila. Encaixe
   * entra com `null` e não casa com horário nenhum — o que está certo: ele não
   * era esperado, então não pode sumir de uma lista de esperados.
   */
  const arrivedAppointments = new Set(
    arrived
      .map((entry) => entry.appointmentId)
      .filter((id): id is string => id !== null),
  )

  const pending = slots
    .filter((slot) => AWAITING_ARRIVAL.has(slot.status))
    .filter((slot) => !arrivedAppointments.has(slot.id))
    .map((slot) => ({
      id: slot.id,
      patientName: slot.patientName,
      professionalName: slot.professionalName,
      startsAt: slot.startsAt,
      lateMinutes: Math.max(
        0,
        Math.floor((now.getTime() - slot.startsAt.getTime()) / MINUTE_MS),
      ),
    }))

  const byTime = (a: ReceptionSlot, b: ReceptionSlot) =>
    a.startsAt.getTime() - b.startsAt.getTime()

  return {
    // Mais atrasado primeiro: é a ordem em que a recepção liga.
    late: pending
      .filter((slot) => slot.lateMinutes > LATE_TOLERANCE_MINUTES)
      .sort((a, b) => b.lateMinutes - a.lateMinutes),
    expected: pending
      .filter((slot) => slot.lateMinutes <= LATE_TOLERANCE_MINUTES)
      .sort(byTime),
    arrivedCount: arrived.length,
  }
}
