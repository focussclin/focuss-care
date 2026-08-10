import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { NewTaskData, Task, TaskStatus, TaskUpdateData } from '../domain/Task'
import type { TaskRepository } from '../domain/TaskRepository'
import { TaskRepositoryError } from '../domain/TaskRepositoryError'
import {
  asTasksClient,
  type TaskQueryError,
  type TaskRow,
  type TasksClient,
  type TaskUpdate,
} from './tasksDatabase'

const TASK_SELECT = `
  id,
  clinic_id,
  title,
  notes,
  status,
  source,
  priority,
  due_at,
  assigned_to,
  created_by,
  patient_id,
  appointment_id,
  invoice_id,
  completed_at,
  created_at,
  updated_at,
  assignee:profiles!clinic_tasks_assigned_to_fkey ( id, full_name ),
  patient:patients ( id, full_name )
`

/**
 * Teto da leitura.
 *
 * A tela agrupa por prazo e a clínica típica não passa de algumas dezenas de
 * pendências. O limite existe para o caso patológico — a clínica que nunca
 * fecha tarefa —, em que trazer tudo transformaria a tela num relatório.
 */
const TASK_ROW_CAP = 200

function toDate(value: string | null): Date | null {
  return value ? new Date(value) : null
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: row.status,
    source: row.source,
    priority: row.priority,
    dueAt: toDate(row.due_at),
    assignee: row.assignee
      ? { id: row.assignee.id, name: row.assignee.full_name }
      : null,
    target: {
      patientId: row.patient_id,
      patientName: row.patient?.full_name ?? null,
      appointmentId: row.appointment_id,
      invoiceId: row.invoice_id,
    },
    completedAt: toDate(row.completed_at),
    createdAt: new Date(row.created_at),
  }
}

/**
 * Leitura e escrita de tarefas.
 *
 * Toda consulta filtra `clinic_id` explicitamente. A RLS impede o vazamento; o
 * filtro impede a consulta errada — defesa em profundidade, como no resto dos
 * adapters.
 */
export class SupabaseTaskRepository implements TaskRepository {
  private readonly client: TasksClient

  constructor(client: SupabaseClient<Database>) {
    this.client = asTasksClient(client)
  }

  async list(clinicId: string): Promise<Task[]> {
    const { data, error } = await this.client
      .from('clinic_tasks')
      .select(TASK_SELECT)
      .eq('clinic_id', clinicId)
      /*
       * Canceladas ficam de fora: elas registram que alguém decidiu NÃO fazer,
       * e essa decisão não é pendência nem histórico de trabalho feito. Sem o
       * filtro, a lista de "concluídas" misturaria os dois.
       */
      .in('status', ['pending', 'in_progress', 'done'])
      .order('priority', { ascending: true })
      .order('due_at', { ascending: true })
      .limit(TASK_ROW_CAP)

    if (error) throw toTaskError(error)

    return (data ?? []).map((row) => toTask(row as unknown as TaskRow))
  }

  async create(
    clinicId: string,
    createdBy: string,
    data: NewTaskData,
  ): Promise<Task> {
    const { data: row, error } = await this.client
      .from('clinic_tasks')
      .insert({
        clinic_id: clinicId,
        title: data.title,
        notes: data.notes,
        status: 'pending',
        priority: data.priority,
        due_at: data.dueAt?.toISOString() ?? null,
        assigned_to: data.assigneeId,
        created_by: createdBy,
        patient_id: data.patientId,
      })
      .select(TASK_SELECT)
      .single()

    if (error) throw toTaskError(error)
    if (!row) throw notFound()

    return toTask(row as unknown as TaskRow)
  }

  async update(
    clinicId: string,
    taskId: string,
    data: TaskUpdateData,
  ): Promise<Task> {
    const patch: TaskUpdate = { updated_at: new Date().toISOString() }

    if (data.title !== undefined) patch.title = data.title
    if (data.notes !== undefined) patch.notes = data.notes
    if (data.priority !== undefined) patch.priority = data.priority
    if (data.dueAt !== undefined) {
      patch.due_at = data.dueAt?.toISOString() ?? null
    }
    if (data.assigneeId !== undefined) patch.assigned_to = data.assigneeId
    if (data.patientId !== undefined) patch.patient_id = data.patientId

    const { data: row, error } = await this.client
      .from('clinic_tasks')
      .update(patch)
      .eq('clinic_id', clinicId)
      .eq('id', taskId)
      .select(TASK_SELECT)
      .maybeSingle()

    if (error) throw toTaskError(error)
    if (!row) throw notFound()

    return toTask(row as unknown as TaskRow)
  }

  async setStatus(
    clinicId: string,
    taskId: string,
    status: TaskStatus,
  ): Promise<Task> {
    const now = new Date().toISOString()

    const { data: row, error } = await this.client
      .from('clinic_tasks')
      .update({
        status,
        updated_at: now,
        /*
         * `completed_at` acompanha o estado, e reabrir LIMPA a marca. Deixá-la
         * para trás faria uma tarefa aberta carregar data de conclusão — e
         * qualquer contagem de "resolvidas no mês" passaria a mentir.
         */
        completed_at: status === 'done' ? now : null,
      })
      .eq('clinic_id', clinicId)
      .eq('id', taskId)
      .select(TASK_SELECT)
      .maybeSingle()

    if (error) throw toTaskError(error)
    if (!row) throw notFound()

    return toTask(row as unknown as TaskRow)
  }
}

function notFound(): TaskRepositoryError {
  return new TaskRepositoryError('not-found', 'tarefa indisponivel')
}

function toTaskError(error: TaskQueryError): TaskRepositoryError {
  const code = error.code ?? undefined

  /*
   * `42P01` (relação inexistente) e `PGRST205` (tabela fora do cache do
   * PostgREST) são a assinatura de "a migration ainda não foi aplicada", e não
   * de erro do usuário. A tela precisa dizer isso — mandar tentar de novo faria
   * a recepção repetir para sempre.
   */
  if (code === '42P01' || code === 'PGRST205') {
    return new TaskRepositoryError(
      'schema-not-ready',
      'clinic_tasks ausente',
      code,
    )
  }

  if (code === '42501') {
    return new TaskRepositoryError('forbidden', 'recusado pela policy', code)
  }

  if (code === '23503') {
    return new TaskRepositoryError('not-found', 'alvo inexistente', code)
  }

  // Só a CLASSE da falha vai adiante: a mensagem do Postgres pode ecoar o
  // título da tarefa, e título de tarefa cita paciente.
  return new TaskRepositoryError('unavailable', 'falha na consulta', code)
}
