'use server'

import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toTaskFailure } from '../application/taskFailure'
import { toTaskDto } from '../application/toTaskDto'
import { taskRepositoryFor } from '../infrastructure/repository'
import {
  taskMessages,
  updateTaskSchema,
  type TaskDto,
  type UpdateTaskInput,
} from '../schemas/task.schema'

type Fields =
  | 'taskId'
  | 'title'
  | 'notes'
  | 'assigneeId'
  | 'dueAt'
  | 'priority'
  | 'patientId'

const runUpdateTask = createAction<UpdateTaskInput, TaskDto, Fields>({
  name: 'task.update',
  schema: updateTaskSchema,
  messages: {
    validation: taskMessages.invalidFields,
    unavailable: taskMessages.unavailable,
    unexpected: taskMessages.unexpected,
  },
  revalidatePaths: ['/tarefas'],
  handler: async (input, context) => {
    try {
      const task = await taskRepositoryFor(context.supabase).update(
        context.clinicId,
        input.taskId,
        {
          title: input.title,
          notes: input.notes || null,
          assigneeId: input.assigneeId,
          dueAt: input.dueAt,
          priority: input.priority,
          patientId: input.patientId,
        },
      )

      return ok(toTaskDto(task))
    } catch (cause) {
      return toTaskFailure<Fields>('task.update', cause)
    }
  },
  audit: (output) => ({
    action: 'task.updated',
    entityType: 'task',
    entityId: output.id,
    after: { priority: output.priority, due_at: output.dueAt },
  }),
})

export async function updateTaskAction(
  rawInput: unknown,
): Promise<ActionResult<TaskDto, Fields>> {
  return runUpdateTask(rawInput)
}
