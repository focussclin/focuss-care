import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { TaskSource, TaskStatus } from '../domain/Task'

/**
 * Tipos locais para a relação nova enquanto o schema remoto não foi aplicado.
 *
 * Mesmo recurso — e mesmo motivo — de `rooms/infrastructure/roomsDatabase.ts`:
 * o cliente real continua sendo o Supabase autenticado que o pipeline entrega,
 * e este contrato só evita editar à mão o `database.types.ts`, que é gerado.
 *
 * Depois de aplicar `20260809_clinic_tasks.sql`, `npm run db:types` passa a ser
 * a fonte oficial e **este arquivo deve ser removido**. Mantê-lo depois disso
 * criaria uma segunda definição da mesma tabela, e a divergência entre as duas
 * não daria erro — só resultado errado.
 */

export interface TaskRow {
  id: string
  clinic_id: string
  title: string
  notes: string | null
  status: TaskStatus
  source: TaskSource
  priority: number
  due_at: string | null
  assigned_to: string | null
  created_by: string | null
  patient_id: string | null
  appointment_id: string | null
  invoice_id: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  /** Vem do join com `profiles`; nulo quando não há responsável. */
  assignee: { id: string; full_name: string } | null
  /** Vem do join com `patients`; nulo quando a tarefa não é sobre alguém. */
  patient: { id: string; full_name: string } | null
}

export interface TaskInsert {
  clinic_id: string
  title: string
  notes: string | null
  status: TaskStatus
  priority: number
  due_at: string | null
  assigned_to: string | null
  created_by: string | null
  patient_id: string | null
}

export interface TaskUpdate {
  title?: string
  notes?: string | null
  status?: TaskStatus
  priority?: number
  due_at?: string | null
  assigned_to?: string | null
  patient_id?: string | null
  completed_at?: string | null
  updated_at?: string
}

export interface TaskQueryError {
  code?: string | null
  message?: string | null
}

export interface TaskQueryResponse<T> {
  data: T
  error: TaskQueryError | null
}

export interface TaskQueryBuilder
  extends PromiseLike<TaskQueryResponse<readonly TaskRow[] | null>> {
  eq(column: string, value: string): TaskQueryBuilder
  in(column: string, values: readonly string[]): TaskQueryBuilder
  order(column: string, options: { ascending: boolean }): TaskQueryBuilder
  limit(count: number): TaskQueryBuilder
  select(columns: string): TaskQueryBuilder
  single(): PromiseLike<TaskQueryResponse<TaskRow | null>>
  maybeSingle(): PromiseLike<TaskQueryResponse<TaskRow | null>>
}

export interface TasksClient {
  from(relation: 'clinic_tasks'): {
    select(columns: string): TaskQueryBuilder
    insert(values: TaskInsert): TaskQueryBuilder
    update(values: TaskUpdate): TaskQueryBuilder
  }
}

export function asTasksClient(client: SupabaseClient<Database>): TasksClient {
  return client as unknown as TasksClient
}
