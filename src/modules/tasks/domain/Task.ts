export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'canceled'

/** De onde a tarefa veio. Hoje só `manual`; ver a migration. */
export type TaskSource = 'manual' | 'automation'

/**
 * Alvo da tarefa — o que ela é sobre.
 *
 * Opcional por construção: "comprar papel para a impressora" não tem paciente,
 * atendimento nem fatura, e é tarefa legítima. Modelar o alvo como obrigatório
 * deixaria de fora justamente o caso mais comum.
 */
export interface TaskTarget {
  patientId: string | null
  patientName: string | null
  appointmentId: string | null
  invoiceId: string | null
}

export interface TaskAssignee {
  id: string
  name: string
}

export interface Task {
  id: string
  title: string
  notes: string | null
  status: TaskStatus
  source: TaskSource
  /** Menor número primeiro, como em `waiting_queue.priority`. */
  priority: number
  dueAt: Date | null
  assignee: TaskAssignee | null
  target: TaskTarget
  completedAt: Date | null
  createdAt: Date
}

export interface NewTaskData {
  title: string
  notes: string | null
  assigneeId: string | null
  dueAt: Date | null
  priority: number
  patientId: string | null
}

export type TaskUpdateData = Partial<NewTaskData>

/**
 * Agrupamento por prazo — a ordem em que a recepção age.
 *
 * `overdue` primeiro porque é o que gera ligação; `undated` por último porque
 * não compete com nada.
 */
export type TaskBucket = 'overdue' | 'today' | 'week' | 'undated'

/** Estados que ainda pedem alguma coisa de alguém. */
export const OPEN_STATUSES: readonly TaskStatus[] = ['pending', 'in_progress']

export function isOpen(task: Task): boolean {
  return OPEN_STATUSES.includes(task.status)
}

/**
 * Em que grupo a tarefa cai.
 *
 * `week` é "até sete dias a partir de hoje", e não "esta semana do calendário":
 * numa sexta-feira, o calendário diria que só sobram dois dias, e a recepção
 * perderia de vista o que vence na segunda.
 */
export function bucketOf(task: Task, now: Date): TaskBucket {
  if (!task.dueAt) return 'undated'

  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)

  if (task.dueAt.getTime() < now.getTime()) return 'overdue'
  if (task.dueAt.getTime() <= endOfToday.getTime()) return 'today'

  const inSevenDays = new Date(endOfToday)
  inSevenDays.setDate(inSevenDays.getDate() + 7)

  return task.dueAt.getTime() <= inSevenDays.getTime() ? 'week' : 'undated'
}
