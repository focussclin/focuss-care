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

export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'canceled'

/** Agrupamento por prazo, na ordem em que a recepção age. */
export type TaskBucket = 'overdue' | 'today' | 'week' | 'undated'

export interface TaskTargetDto {
  /** Rótulo pronto: "Maria Silva", "Atendimento de 12/08", "Fatura #1234". */
  label: string
  /** Para onde o link leva. Já validado como caminho interno. */
  href: string
}

export interface TaskDto {
  id: string
  title: string
  notes: string | null
  status: TaskStatus
  /** Menor número primeiro, como em `waiting_queue.priority`. */
  priority: number
  /** Frase relativa pronta: "vence em 2 dias". Null quando não há prazo. */
  dueLabel: string | null
  /** Data absoluta para o `title` do elemento. */
  dueAt: string | null
  assignee: { id: string; name: string } | null
  target: TaskTargetDto | null
}

export interface TaskGroupDto {
  bucket: TaskBucket
  tasks: readonly TaskDto[]
}

export interface TaskFormValues {
  title: string
  notes: string
  assigneeId: string | null
  dueAt: string | null
  priority: number
  patientId: string | null
}

export interface TasksScreenProps {
  /** Já agrupadas e ordenadas pela rota. Grupo vazio não é enviado. */
  groups: readonly TaskGroupDto[]

  /** Equipe elegível como responsável. */
  assignees: readonly { id: string; name: string }[]

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
}
