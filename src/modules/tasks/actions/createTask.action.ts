'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toTaskFailure } from '../application/taskFailure'
import { toTaskDto } from '../application/toTaskDto'
import { taskRepositoryFor } from '../infrastructure/repository'
import {
  createTaskSchema,
  taskMessages,
  type CreateTaskInput,
  type TaskDto,
} from '../schemas/task.schema'

type Fields = 'title' | 'notes' | 'assigneeId' | 'dueAt' | 'priority' | 'patientId'

const runCreateTask = createAction<CreateTaskInput, TaskDto, Fields>({
  name: 'task.create',
  schema: createTaskSchema,
  roles: rolesWith('team.read'),
  messages: {
    validation: taskMessages.invalidFields,
    unavailable: taskMessages.unavailable,
    unexpected: taskMessages.unexpected,
  },
  revalidatePaths: ['/tarefas'],
  handler: async (input, context) => {
    try {
      const task = await taskRepositoryFor(context.supabase).create(
        context.clinicId,
        context.userId,
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
      return toTaskFailure<Fields>('task.create', cause)
    }
  },
  audit: (output) => ({
    action: 'task.created',
    entityType: 'task',
    entityId: output.id,
    after: { priority: output.priority, due_at: output.dueAt },
  }),
})

export async function createTaskAction(
  rawInput: unknown,
): Promise<ActionResult<TaskDto, Fields>> {
  return runCreateTask(rawInput)
}
