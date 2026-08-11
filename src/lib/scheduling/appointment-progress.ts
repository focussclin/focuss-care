import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'
import type { AppointmentProgress } from '@/modules/scheduling/domain/AppointmentLifecycle'
import { isAppointmentRepositoryError } from '@/modules/scheduling/domain/AppointmentRepositoryError'
import { appointmentRepositoryFor } from '@/modules/scheduling/infrastructure/repository'

/**
 * A fila move a agenda — feature **A-04**.
 *
 * # O defeito que isto conserta
 *
 * `appointment_status` tem `checked_in` e `in_progress` desde o primeiro schema,
 * e **nenhum dos dois era alcançável**. Quem move o paciente pela fila é o módulo
 * de atendimento; quem guarda o status do agendamento é a agenda. Sem ninguém
 * ligando os dois, a agenda mostrava "Agendado" sobre uma pessoa que já estava
 * na sala — duas telas afirmando coisas diferentes sobre a mesma pessoa no mesmo
 * minuto. §8.34 registrou isso como limite honesto daquela fatia; esta o fecha.
 *
 * # Por que aqui, e não dentro de um dos dois módulos
 *
 * A regra 4 proíbe um módulo alcançar o interior do outro, e ela é boa: se
 * `encounters` escrevesse em `appointments`, a máquina de estados da agenda
 * passaria a ter dois donos. `lib/` é a camada de composição — é onde
 * `lib/notifications/operational.ts` já faz exatamente isto: um efeito derivado
 * que atravessa módulos, chamado de `afterSuccess`.
 *
 * A transição em si continua sendo do módulo dono: este arquivo chama
 * `markProgress`, que é o mesmo compare-and-swap das outras transições, com
 * `appointment_status_history` registrada junto.
 *
 * # Best-effort, e o "por quê" importa
 *
 * O paciente **chegou**. Se a agenda não puder ser carimbada — porque a linha
 * sumiu, porque a policy recusou, porque outra pessoa já registrou o desfecho —
 * a fila de espera não pode voltar atrás: quem está no balcão viu a pessoa
 * entrar. O desfecho fica no log do servidor e a operação segue.
 *
 * É o mesmo desenho de `recordAuditEvent`: nunca lança, sempre devolve o
 * resultado para quem quiser decidir algo com ele.
 */

type Client = SupabaseClient<Database>

export type AppointmentProgressSkip =
  /** Encaixe: não havia agendamento para carimbar. */
  | 'walk-in'
  /** A agenda já passou deste ponto — desfecho registrado, ou cancelado. */
  | 'stale-status'
  /** O agendamento não existe mais nesta clínica. */
  | 'not-found'
  /** A policy recusou a escrita. */
  | 'forbidden'
  /** Qualquer outra recusa, inclusive modo de demonstração. */
  | 'unavailable'

export type AppointmentProgressOutcome =
  | { synced: true }
  | { synced: false; reason: AppointmentProgressSkip }

export interface SyncAppointmentProgressInput {
  /** Cliente com a sessão de quem agiu — a RLS vale nesta escrita também. */
  client: Client
  /** Clínica ativa, resolvida pelo banco. Nunca veio do cliente. */
  clinicId: string
  /**
   * O agendamento que originou a fila, ou `null`.
   *
   * `null` é **encaixe**, e é rotina de clínica: quem chega sem hora marcada
   * entra na fila do mesmo jeito. Não há agenda a mover, e isso não é falha.
   */
  appointmentId: string | null
  progress: AppointmentProgress
  /** Quem agiu. Vai para `appointment_status_history`. */
  userId: string
}

export async function syncAppointmentProgress({
  client,
  clinicId,
  appointmentId,
  progress,
  userId,
}: SyncAppointmentProgressInput): Promise<AppointmentProgressOutcome> {
  if (!appointmentId) return { synced: false, reason: 'walk-in' }

  try {
    await appointmentRepositoryFor(client).markProgress(
      clinicId,
      appointmentId,
      progress,
      userId,
    )

    return { synced: true }
  } catch (cause) {
    const reason = skipReasonOf(cause)

    /*
     * Só a CLASSE da falha vai para o log — nem o motivo do atendimento nem o
     * nome do paciente passam por aqui, e o texto do Postgres pode ecoar o valor
     * consultado.
     */
    console.error('[appointment.progress] agenda não acompanhou a fila', {
      progress,
      reason,
    })

    return { synced: false, reason }
  }
}

function skipReasonOf(cause: unknown): AppointmentProgressSkip {
  if (!isAppointmentRepositoryError(cause)) return 'unavailable'

  switch (cause.reason) {
    /*
     * `stale-status` é o caso ESPERADO, não um defeito: a agenda já registrou o
     * desfecho, ou o atendimento foi cancelado enquanto a pessoa esperava. Os
     * três terminais não voltam — é a mesma regra que a agenda aplica quando
     * alguém tenta reabrir um atendimento concluído.
     */
    case 'stale-status':
      return 'stale-status'
    case 'not-found':
      return 'not-found'
    case 'forbidden':
      return 'forbidden'
    default:
      return 'unavailable'
  }
}
