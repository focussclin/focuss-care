'use server'

import { createTaskAction } from './createTask.action'
import { setTaskStatusAction } from './setTaskStatus.action'
import { updateTaskAction } from './updateTask.action'
import type { TaskFormValues } from '../schemas/task.schema'

/** Adapter de Server Actions para a view: a camada visual recebe só mensagens. */
export async function submitTaskFromScreen(
  values: TaskFormValues,
  taskId: string | null,
): Promise<string | null> {
  const result = taskId
    ? await updateTaskAction({ taskId, ...values })
    : await createTaskAction(values)

  return result.ok ? null : result.error.message
}

export async function toggleTaskDoneFromScreen(
  taskId: string,
  done: boolean,
): Promise<string | null> {
  const result = await setTaskStatusAction({
    taskId,
    status: done ? 'done' : 'pending',
  })

  return result.ok ? null : result.error.message
}

export async function cancelTaskFromScreen(
  taskId: string,
): Promise<string | null> {
  const result = await setTaskStatusAction({ taskId, status: 'canceled' })
  return result.ok ? null : result.error.message
}
