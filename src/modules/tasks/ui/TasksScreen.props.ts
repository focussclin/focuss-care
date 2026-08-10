/**
 * CONTRATO da tela de tarefas — dono: Claude (código).
 *
 * A view (dono: Codex) implementa contra esta interface. Ver `TASKS_DESIGN.md`.
 *
 * # Estado desta fatia
 *
 * `clinic_tasks` **não existe no banco ainda**: a migration
 * `supabase/migrations/20260809_clinic_tasks.sql` está escrita e revisada, sem
 * aplicação.
 */

export type { TaskBucket, TaskStatus } from '../domain/Task'
export type {
  TaskDto,
  TaskFormValues,
  TaskGroupDto,
  TaskTargetDto,
} from '../schemas/task.schema'

import type { TaskFormValues, TaskGroupDto } from '../schemas/task.schema'

export interface TasksScreenProps {
  /** Já agrupadas e ordenadas pela rota. Grupo vazio não é enviado. */
  groups: readonly TaskGroupDto[]

  /** Equipe elegível como responsável. */
  assignees: readonly { id: string; name: string }[]

  /** Pacientes ativos disponíveis para relacionar uma tarefa. */
  patients: readonly { id: string; name: string }[]

  /** Usuário da sessão, usado pelo filtro "Minhas". */
  currentUserId: string | null

  onSubmit: (
    values: TaskFormValues,
    taskId: string | null,
  ) => Promise<string | null>

  /**
   * Concluir e reabrir são o mesmo envio.
   *
   * A view mostra `Desfazer` durante a espera; quem decide o intervalo é ela,
   * porque é decisão de interação. O servidor não guarda estado intermediário.
   */
  onToggleDone: (taskId: string, done: boolean) => Promise<string | null>

  /** Cancelar é diferente de concluir: "não era para fazer". */
  onCancel: (taskId: string) => Promise<string | null>

  isLive: boolean

  /** Verdadeiro quando a interface está pronta, mas a migration ainda não existe no banco. */
  schemaPending?: boolean
}
