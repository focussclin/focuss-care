import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { getSessionState } from '@/lib/auth/session'
import { startOfDay } from '@/lib/utils/date'
import { toTaskGroups } from '@/modules/tasks/application/toTaskDto'
import {
  cancelTaskFromScreen,
  submitTaskFromScreen,
  toggleTaskDoneFromScreen,
} from '@/modules/tasks/actions/taskScreen.actions'
import { isTaskRepositoryError } from '@/modules/tasks/domain/TaskRepositoryError'
import { getTaskRepository } from '@/modules/tasks/infrastructure/repository'
import { getPatientRepository } from '@/modules/patients/infrastructure/repository'
import { getTeamRepository } from '@/modules/team/infrastructure/repository'

import { TasksScreen } from '@/modules/tasks/ui/TasksScreen'

export const metadata: Metadata = {
  title: 'Tarefas',
  description: 'Pendências operacionais da equipe da clínica.',
}

export default async function TarefasPage() {
  await connection()

  const today = startOfDay(new Date())
  const [taskSource, patientSource, teamSource, session, role] = await Promise.all([
    getTaskRepository(),
    getPatientRepository(today),
    getTeamRepository(),
    getSessionState(),
    getActiveClinicRole(),
  ])

  if (taskSource.isLive && (!can(role, 'patient.read') || !can(role, 'team.read'))) {
    forbidden()
  }

  let tasks = [] as Awaited<ReturnType<typeof taskSource.repository.list>>
  let schemaPending = false

  try {
    tasks = await taskSource.repository.list(taskSource.clinicId)
  } catch (cause) {
    if (isTaskRepositoryError(cause) && cause.reason === 'schema-not-ready') {
      schemaPending = true
    } else {
      throw cause
    }
  }

  const [patientPage, members] = await Promise.all([
    patientSource.repository.listPage(patientSource.clinicId, {
      search: null,
      status: 'active',
      limit: 50,
      cursor: null,
    }),
    teamSource.repository.listMembers(teamSource.clinicId),
  ])

  return (
    <TasksScreen
      groups={toTaskGroups(tasks, new Date())}
      assignees={members
        .filter((member) => member.status === 'active')
        .map((member) => ({ id: member.userId, name: member.name }))}
      patients={patientPage.items.map((patient) => ({
        id: patient.id,
        name: patient.name,
      }))}
      currentUserId={session.status === 'active' ? session.user.id : null}
      onSubmit={submitTaskFromScreen}
      onToggleDone={toggleTaskDoneFromScreen}
      onCancel={cancelTaskFromScreen}
      isLive={taskSource.isLive}
      schemaPending={schemaPending}
    />
  )
}
