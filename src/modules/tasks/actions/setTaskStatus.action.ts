'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toTaskFailure } from '../application/taskFailure'
import { toTaskDto } from '../application/toTaskDto'
import { taskRepositoryFor } from '../infrastructure/repository'
import {
  setTaskStatusSchema,
  taskMessages,
  type SetTaskStatusInput,
  type TaskDto,
} from '../schemas/task.schema'

type Fields = 'taskId' | 'status'

const runSetTaskStatus = createAction<SetTaskStatusInput, TaskDto, Fields>({
  name: 'task.setStatus',
  schema: setTaskStatusSchema,
  roles: rolesWith('team.read'),
  messages: {
    validation: taskMessages.invalidFields,
    unavailable: taskMessages.unavailable,
    unexpected: taskMessages.unexpected,
  },
  revalidatePaths: ['/tarefas'],
  handler: async (input, context) => {
    try {
      const task = await taskRepositoryFor(context.supabase).setStatus(
        context.clinicId,
        input.taskId,
        input.status,
      )

      return ok(toTaskDto(task))
    } catch (cause) {
      return toTaskFailure<Fields>('task.setStatus', cause)
    }
  },
  audit: (output, input) => ({
    action:
      input.status === 'done'
        ? 'task.completed'
        : input.status === 'canceled'
          ? 'task.canceled'
          : 'task.reopened',
    entityType: 'task',
    entityId: output.id,
    after: { status: input.status },
  }),
})

export async function setTaskStatusAction(
  rawInput: unknown,
): Promise<ActionResult<TaskDto, Fields>> {
  return runSetTaskStatus(rawInput)
}
