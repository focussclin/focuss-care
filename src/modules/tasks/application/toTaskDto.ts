import { formatShortDate, isSameDay, startOfDay } from '@/lib/utils/date'

import { bucketOf, type Task, type TaskBucket } from '../domain/Task'
import type {
  TaskDto,
  TaskGroupDto,
  TaskTargetDto,
} from '../schemas/task.schema'

const BUCKET_ORDER: readonly TaskBucket[] = [
  'overdue',
  'today',
  'week',
  'undated',
]

/** Converte a entidade com Date para o contrato serializável da view. */
export function toTaskDto(task: Task, now: Date = new Date()): TaskDto {
  return {
    id: task.id,
    title: task.title,
    notes: task.notes,
    status: task.status,
    priority: task.priority,
    dueLabel: task.dueAt ? dueLabel(task.dueAt, now) : null,
    dueAt: task.dueAt?.toISOString() ?? null,
    assignee: task.assignee,
    target: toTargetDto(task),
  }
}

/** Agrupa e ordena no servidor para a tela não precisar conhecer a entidade. */
export function toTaskGroups(
  tasks: readonly Task[],
  now: Date = new Date(),
): TaskGroupDto[] {
  const grouped = new Map<TaskBucket, TaskDto[]>(
    BUCKET_ORDER.map((bucket) => [bucket, []]),
  )

  for (const task of tasks) {
    grouped.get(bucketOf(task, now))?.push(toTaskDto(task, now))
  }

  return BUCKET_ORDER.flatMap((bucket) => {
    const bucketTasks = grouped.get(bucket) ?? []
    bucketTasks.sort(compareTasks)
    return bucketTasks.length > 0 ? [{ bucket, tasks: bucketTasks }] : []
  })
}

function compareTasks(first: TaskDto, second: TaskDto): number {
  return (
    first.priority - second.priority ||
    (first.dueAt ? Date.parse(first.dueAt) : Number.POSITIVE_INFINITY) -
      (second.dueAt ? Date.parse(second.dueAt) : Number.POSITIVE_INFINITY) ||
    first.title.localeCompare(second.title, 'pt-BR')
  )
}

function dueLabel(dueAt: Date, now: Date): string {
  if (dueAt.getTime() < now.getTime()) {
    if (isSameDay(dueAt, now)) return 'venceu hoje'

    const days = Math.max(
      1,
      Math.round(
        (startOfDay(now).getTime() - startOfDay(dueAt).getTime()) /
          86_400_000,
      ),
    )
    return `venceu há ${days} ${days === 1 ? 'dia' : 'dias'}`
  }

  if (isSameDay(dueAt, now)) return 'vence hoje'

  const tomorrow = new Date(startOfDay(now))
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (isSameDay(dueAt, tomorrow)) return 'vence amanhã'

  const days = Math.max(
    2,
    Math.round(
      (startOfDay(dueAt).getTime() - startOfDay(now).getTime()) / 86_400_000,
    ),
  )
  return `vence em ${days} dias`
}

function toTargetDto(task: Task): TaskTargetDto | null {
  if (task.target.patientId && task.target.patientName) {
    return {
      label: task.target.patientName,
      href: `/pacientes/${task.target.patientId}`,
    }
  }

  // Atendimento e fatura serão enriquecidos quando as telas de origem passarem
  // a criar tarefas. Não fabricamos um rótulo a partir do UUID.
  return null
}

export function formatTaskAbsoluteDate(iso: string | null): string | undefined {
  return iso ? formatShortDate(new Date(iso)) : undefined
}
