import type { NewTaskData, Task, TaskUpdateData } from './Task'

/** Porta das tarefas da clínica. */
export interface TaskRepository {
  /** Abertas e concluídas do período visível; a tela agrupa. */
  list(clinicId: string): Promise<Task[]>
  create(clinicId: string, createdBy: string, data: NewTaskData): Promise<Task>
  update(clinicId: string, taskId: string, data: TaskUpdateData): Promise<Task>
  /**
   * Concluir, reabrir e cancelar são a MESMA transição de estado.
   *
   * Métodos separados fariam três caminhos para escrever a mesma coluna, e um
   * deles esqueceria `completed_at`.
   */
  setStatus(clinicId: string, taskId: string, status: Task['status']): Promise<Task>
}
