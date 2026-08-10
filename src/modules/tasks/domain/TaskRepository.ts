import type { NewTaskData, Task, TaskUpdateData } from './Task'

/** Porta das tarefas da clínica. */
export interface TaskRepository {
  /** Abertas e concluídas do período visível; a tela agrupa. */
  list(clinicId: string): Promise<Task[]>

  /**
   * Só as ABERTAS de uma pessoa — o que o portal dela precisa saber hoje.
   *
   * Duas diferenças em relação a `list`, e as duas são deliberadas:
   *
   *  1. **O filtro é no banco.** Trazer a clínica inteira para separar em
   *     memória entregaria ao portal de uma pessoa as tarefas de todas as
   *     outras, pelo payload. É o mesmo motivo de
   *     `listByProfessionalRange` na agenda.
   *  2. **Concluídas ficam de fora.** `/tarefas` mostra as duas porque é a
   *     visão de coordenação da equipe; o portal responde "o que falta eu
   *     fazer", e tarefa concluída não falta.
   *
   * `assigneeId` é `profiles.id` — o usuário da sessão, e **não**
   * `professionals.id`. Tarefa administrativa é atribuída a quem tem conta,
   * não a quem atende: a recepção resolve a maioria delas e não tem linha em
   * `professionals`.
   */
  listAssignedTo(clinicId: string, assigneeId: string): Promise<Task[]>
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
