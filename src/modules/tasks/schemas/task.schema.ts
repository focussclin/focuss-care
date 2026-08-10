import { z } from 'zod'

import type { TaskBucket, TaskStatus } from '../domain/Task'

export const taskMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  titleRequired: 'Escreva o que precisa ser feito.',
  titleTooLong: 'Use no máximo 140 caracteres.',
  notesTooLong: 'Use no máximo 1000 caracteres nos detalhes.',
  priorityInvalid: 'Prioridade inválida.',
  dueInvalid: 'Data de prazo inválida.',
  forbidden: 'Você não tem permissão para gerenciar tarefas nesta clínica.',
  notFound: 'Esta tarefa não está mais disponível nesta clínica.',
  schemaPending:
    'As tarefas ainda estão sendo preparadas no banco. Aplique a migration indicada e tente novamente.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a ação agora. Tente novamente.',
} as const

/**
 * Três prioridades, e o número é o do banco.
 *
 * `waiting_queue` já usa "menor primeiro", e repetir a convenção evita que duas
 * telas do produto ordenem ao contrário uma da outra.
 */
export const TASK_PRIORITIES = [1, 3, 5] as const

const taskStatuses = [
  'pending',
  'in_progress',
  'done',
  'canceled',
] as const satisfies readonly TaskStatus[]

/**
 * Data vinda do formulário: `yyyy-mm-dd` ou vazio.
 *
 * Vira o FIM do dia escolhido, e não a meia-noite: uma tarefa com prazo para
 * hoje não pode nascer vencida às 00h01. É a mesma razão pela qual
 * `bucketOf` compara com o fim do dia.
 */
const dueAt = z
  .union([z.literal(''), z.null(), z.iso.date(taskMessages.dueInvalid)])
  .transform((value) => {
    if (!value) return null

    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day, 23, 59, 59, 999)
  })

const taskDataShape = {
  title: z
    .string()
    .trim()
    .min(3, taskMessages.titleRequired)
    .max(140, taskMessages.titleTooLong),
  notes: z.string().trim().max(1000, taskMessages.notesTooLong).default(''),
  assigneeId: z
    .union([z.literal(''), z.null(), z.uuid(taskMessages.unexpected)])
    .transform((value) => value || null),
  dueAt,
  priority: z
    .number()
    .int(taskMessages.priorityInvalid)
    .refine(
      (value) => (TASK_PRIORITIES as readonly number[]).includes(value),
      taskMessages.priorityInvalid,
    )
    .default(3),
  patientId: z
    .union([z.literal(''), z.null(), z.uuid(taskMessages.unexpected)])
    .transform((value) => value || null),
}

export const createTaskSchema = z.object(taskDataShape)
export type CreateTaskInput = z.infer<typeof createTaskSchema>

export const updateTaskSchema = z.object({
  taskId: z.uuid(taskMessages.unexpected),
  ...taskDataShape,
})
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>

export const setTaskStatusSchema = z.object({
  taskId: z.uuid(taskMessages.unexpected),
  status: z.enum(taskStatuses, taskMessages.unexpected),
})
export type SetTaskStatusInput = z.infer<typeof setTaskStatusSchema>

/**
 * Alvo já resolvido para a tela: rótulo e destino.
 *
 * A entidade guarda três identificadores (`patient_id`, `appointment_id`,
 * `invoice_id`); a view recebe um link ou nada. Traduzir aqui é o que impede a
 * tela de decidir sozinha que um UUID vira endereço — hoje só o paciente tem
 * rota própria.
 */
export interface TaskTargetDto {
  label: string
  href: string
}

/** O que a view recebe — sem `Date`, que não atravessa a fronteira RSC bem. */
export interface TaskDto {
  id: string
  title: string
  notes: string | null
  status: TaskStatus
  priority: number
  /** Frase relativa pronta: "vence em 2 dias". Null quando não há prazo. */
  dueLabel: string | null
  /** ISO, para o `title` do elemento. */
  dueAt: string | null
  assignee: { id: string; name: string } | null
  target: TaskTargetDto | null
}

export interface TaskGroupDto {
  bucket: TaskBucket
  tasks: readonly TaskDto[]
}

/** O que o formulário devolve, antes da validação do servidor. */
export interface TaskFormValues {
  title: string
  notes: string
  assigneeId: string | null
  dueAt: string | null
  priority: number
  patientId: string | null
}
