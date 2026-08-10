import type { NewTaskData, Task, TaskStatus, TaskUpdateData } from '../domain/Task'
import type { TaskRepository } from '../domain/TaskRepository'
import { TaskRepositoryError } from '../domain/TaskRepositoryError'

/**
 * Demonstração local.
 *
 * **Não inventa tarefas de exemplo.** Uma lista fictícia de pendências diria à
 * pessoa que alguém da equipe combinou aquilo — e "ligar para a paciente que
 * faltou" é o tipo de frase que se lê como instrução, não como amostra.
 *
 * As escritas ficam na memória da instância, então a tela responde de verdade a
 * quem experimenta o fluxo, e nada persiste. É o mesmo desenho de
 * `MockRoomRepository`.
 */
export class MockTaskRepository implements TaskRepository {
  private tasks: Task[] = []
  private sequence = 0

  async list(): Promise<Task[]> {
    return [...this.tasks].sort(
      (a, b) =>
        a.priority - b.priority ||
        (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity),
    )
  }

  async create(
    _clinicId: string,
    _createdBy: string,
    data: NewTaskData,
  ): Promise<Task> {
    this.sequence += 1

    const task: Task = {
      id: `task-demo-${this.sequence}`,
      title: data.title,
      notes: data.notes,
      status: 'pending',
      source: 'manual',
      priority: data.priority,
      dueAt: data.dueAt,
      assignee: null,
      target: {
        patientId: data.patientId,
        patientName: null,
        appointmentId: null,
        invoiceId: null,
      },
      completedAt: null,
      createdAt: new Date(),
    }

    this.tasks.push(task)
    return task
  }

  async update(
    _clinicId: string,
    taskId: string,
    data: TaskUpdateData,
  ): Promise<Task> {
    const task = this.find(taskId)

    if (data.title !== undefined) task.title = data.title
    if (data.notes !== undefined) task.notes = data.notes
    if (data.priority !== undefined) task.priority = data.priority
    if (data.dueAt !== undefined) task.dueAt = data.dueAt

    return task
  }

  async setStatus(
    _clinicId: string,
    taskId: string,
    status: TaskStatus,
  ): Promise<Task> {
    const task = this.find(taskId)

    task.status = status
    task.completedAt = status === 'done' ? new Date() : null

    return task
  }

  private find(taskId: string): Task {
    const task = this.tasks.find((item) => item.id === taskId)
    if (!task) throw new TaskRepositoryError('not-found', 'tarefa indisponivel')

    return task
  }
}
