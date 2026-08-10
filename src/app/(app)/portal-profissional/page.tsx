import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import {
  getActiveClinicRole,
  getCurrentProfessionalId,
} from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { getSessionState } from '@/lib/auth/session'
import { addDays, formatFullDate, startOfDay } from '@/lib/utils/date'
import {
  splitDay,
  summarize,
  type PortalTask,
} from '@/modules/portal/domain/ProfessionalDay'
import {
  toPortalAppointmentDto,
  toPortalSummaryDto,
  toPortalTaskDto,
} from '@/modules/portal/application/toPortalDto'
import { PortalProfissionalScreen } from '@/modules/portal/ui/PortalProfissionalScreen'
import { getAppointmentRepository } from '@/modules/scheduling/infrastructure/repository'
import { isTaskRepositoryError } from '@/modules/tasks/domain/TaskRepositoryError'
import { getTaskRepository } from '@/modules/tasks/infrastructure/repository'

export const metadata: Metadata = {
  title: 'Portal do profissional',
  description: 'Seus atendimentos do dia e as tarefas atribuídas a você.',
}

/**
 * Portal do profissional.
 *
 * A composição entre `scheduling`, `tasks` e `portal` acontece AQUI, na rota —
 * regra 4 da arquitetura. O módulo `portal` não alcança o interior de nenhum
 * dos outros dois: ele recebe atendimentos (`_shared/domain`) e um tipo próprio
 * de tarefa, ambos montados neste arquivo.
 *
 * # As três identidades desta tela, e por que são três
 *
 *  - **Papel** (`current_clinic_role`) → autoriza. `finance` não entra.
 *  - **`professionals.id`** (`current_professional_id`) → filtra a AGENDA.
 *    É quem atende, e recepção/financeiro não têm linha ali.
 *  - **`profiles.id`** (sessão) → filtra as TAREFAS. Tarefa administrativa é
 *    atribuída a quem tem conta, não a quem atende.
 *
 * Confundir as duas últimas é o erro fácil: filtrar tarefa por `professionals.id`
 * devolveria zero para todo mundo, em silêncio, porque `clinic_tasks.assigned_to`
 * referencia `profiles`.
 */
export default async function PortalProfissionalPage() {
  await connection()

  const now = new Date()
  const today = startOfDay(now)

  const [appointmentSource, taskSource, session, role, professionalId] =
    await Promise.all([
      getAppointmentRepository(today),
      getTaskRepository(),
      getSessionState(),
      getActiveClinicRole(),
      getCurrentProfessionalId(),
    ])

  /*
   * `appointment.read` é o portão, e é o mesmo de `/agenda`.
   *
   * `finance` é o único papel sem ele, e a matriz de `lib/auth/permissions.ts`
   * diz por quê: "o que ele não alcança é agenda, atendimento e prontuário".
   * O portal é agenda — a de uma pessoa só, o que não o torna menos agenda.
   */
  if (appointmentSource.isLive && !can(role, 'appointment.read')) forbidden()

  /*
   * Sem cadastro de profissional não há agenda pessoal, e isso NÃO é erro.
   *
   * Um `admin` tem `appointment.read` e passa pelo portão acima, legitimamente.
   * O que ele não tem é linha em `professionals`, porque não atende. A tela
   * explica isso em vez de mostrar zero — e a consulta nem acontece, porque
   * consultar com `professionalId` nulo devolveria a agenda de ninguém ou,
   * pior, dependendo de como o filtro fosse escrito, a de todos.
   */
  const hasProfessional = professionalId !== null

  const appointments =
    hasProfessional && appointmentSource.isLive
      ? await appointmentSource.repository.listByProfessionalRange(
          appointmentSource.clinicId,
          professionalId,
          today,
          addDays(today, 1),
        )
      : []

  /*
   * As tarefas dependem de `clinic_tasks`, que ainda não existe no banco.
   *
   * A falha é isolada de propósito: a agenda acima é real e não depende dela.
   * Derrubar o portal inteiro por causa do painel lateral trocaria uma ausência
   * parcial por uma total — mesmo tratamento que `/tarefas` já dá.
   */
  const userId = session.status === 'active' ? session.user.id : null
  let tasks: PortalTask[] = []
  let tasksSchemaPending = false

  if (userId && taskSource.isLive) {
    try {
      const rows = await taskSource.repository.listAssignedTo(
        taskSource.clinicId,
        userId,
      )

      tasks = rows.map((task) => ({
        id: task.id,
        title: task.title,
        dueAt: task.dueAt,
        priority: task.priority,
        patientName: task.target.patientName,
      }))
    } catch (cause) {
      if (isTaskRepositoryError(cause) && cause.reason === 'schema-not-ready') {
        tasksSchemaPending = true
      } else {
        throw cause
      }
    }
  }

  const day = splitDay(appointments, now)
  const summary = summarize(day, tasks, now)

  const firstName =
    session.status === 'active'
      ? (session.user.displayName.split(' ')[0] ?? '')
      : ''

  return (
    <PortalProfissionalScreen
      greetingName={firstName}
      dayLabel={formatFullDate(today)}
      summary={toPortalSummaryDto(summary)}
      current={day.current ? toPortalAppointmentDto(day.current) : null}
      unclosed={day.unclosed.map(toPortalAppointmentDto)}
      upcoming={day.upcoming.map(toPortalAppointmentDto)}
      finished={day.finished.map(toPortalAppointmentDto)}
      tasks={tasks.map((task) => toPortalTaskDto(task, now))}
      noProfessional={appointmentSource.isLive && !hasProfessional}
      tasksSchemaPending={tasksSchemaPending}
      isLive={appointmentSource.isLive}
    />
  )
}
