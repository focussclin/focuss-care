import type { TaskBucket } from '../domain/Task'
import type { TaskDto, TaskGroupDto } from '../schemas/task.schema'

/**
 * Os filtros da tela de tarefas — extraídos do componente.
 *
 * # Por que saíram de lá
 *
 * A regra de o que aparece na lista vivia num `useMemo` dentro de
 * `TasksScreen`, com três funções auxiliares no fim do arquivo. Funcionava, e
 * era verificável só renderizando a tela e lendo o DOM — o que torna caro
 * cobrir as combinações, e caro é o mesmo que não cobrir.
 *
 * As combinações importam porque elas se acumulam: "minhas" + "concluídas" +
 * "esta semana" é uma pergunta diferente de cada uma isolada, e é a que a
 * recepção faz na sexta-feira.
 *
 * # O que continua na tela
 *
 * O estado dos seletores e a decisão de quando limpar. Isto aqui só responde
 * "dado este recorte, o que se vê".
 */

export type StatusFilter = 'open' | 'done' | 'all'
export type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'undated'
/** `'all'`, `'mine'`, ou o id de um membro da equipe. */
export type AssigneeFilter = string

export interface TaskFilters {
  status: StatusFilter
  assignee: AssigneeFilter
  due: DueFilter
}

/** O recorte com que a tela abre: o que ainda pede alguma coisa de alguém. */
export const DEFAULT_TASK_FILTERS: TaskFilters = {
  status: 'open',
  assignee: 'all',
  due: 'all',
}

/**
 * A ordem em que a recepção age.
 *
 * `overdue` primeiro porque é o que gera ligação; `undated` por último porque
 * não compete com nada. Mesma ordem de `toTaskGroups` — e ela é repetida aqui
 * de propósito: filtrar reconstrói os grupos, e herdar a ordem da entrada
 * faria o resultado depender de quem chamou.
 */
const BUCKET_ORDER: readonly TaskBucket[] = [
  'overdue',
  'today',
  'week',
  'undated',
]

/**
 * Alguma coisa está filtrada?
 *
 * Serve à tela para decidir entre "nenhuma tarefa ainda" e "nenhuma tarefa com
 * esses filtros" — dois vazios com ações opostas: o primeiro convida a criar, o
 * segundo a afrouxar o recorte.
 */
export function hasActiveFilters(filters: TaskFilters): boolean {
  return (
    filters.status !== DEFAULT_TASK_FILTERS.status ||
    filters.assignee !== DEFAULT_TASK_FILTERS.assignee ||
    filters.due !== DEFAULT_TASK_FILTERS.due
  )
}

/**
 * Aplica os três filtros e remonta os grupos.
 *
 * Grupo que ficou vazio não é devolvido: um cabeçalho "Vencidas" com nada
 * embaixo se lê como coisa quebrada, não como ausência.
 */
export function filterTaskGroups(
  groups: readonly TaskGroupDto[],
  filters: TaskFilters,
  currentUserId: string | null,
): TaskGroupDto[] {
  const byBucket = new Map<TaskBucket, TaskDto[]>(
    BUCKET_ORDER.map((bucket) => [bucket, []]),
  )

  for (const group of groups) {
    if (!matchesDue(group.bucket, filters.due)) continue

    for (const task of group.tasks) {
      if (!matchesStatus(task, filters.status)) continue
      if (!matchesAssignee(task, filters.assignee, currentUserId)) continue

      byBucket.get(group.bucket)?.push(task)
    }
  }

  return BUCKET_ORDER.flatMap((bucket) => {
    const tasks = byBucket.get(bucket) ?? []
    return tasks.length > 0 ? [{ bucket, tasks }] : []
  })
}

export function matchesStatus(task: TaskDto, filter: StatusFilter): boolean {
  if (filter === 'open') {
    return task.status === 'pending' || task.status === 'in_progress'
  }

  if (filter === 'done') return task.status === 'done'

  /*
   * `'all'` NÃO inclui cancelada.
   *
   * "Todas" quer dizer "tudo que aconteceu ou vai acontecer". Cancelada é a
   * decisão de NÃO fazer — ela não é trabalho pendente nem trabalho feito, e
   * misturá-la no total faria a lista de "todas" contar coisas que ninguém vai
   * executar. O registro dela permanece no banco; a tela é que não a oferece.
   */
  return task.status !== 'canceled'
}

export function matchesAssignee(
  task: TaskDto,
  filter: AssigneeFilter,
  currentUserId: string | null,
): boolean {
  if (filter === 'all') return true

  /*
   * "Minhas" com sessão sem id não devolve tudo — devolve nada.
   *
   * `undefined === null` seria falso e o resultado sairia certo por acidente;
   * o que se quer garantir é que não haja caminho em que "minhas" signifique
   * "de todo mundo".
   */
  if (filter === 'mine') {
    return currentUserId !== null && task.assignee?.id === currentUserId
  }

  return task.assignee?.id === filter
}

export function matchesDue(bucket: TaskBucket, filter: DueFilter): boolean {
  if (filter === 'all') return true

  /*
   * "Esta semana" inclui hoje.
   *
   * Quem filtra por semana está planejando os próximos dias, e uma lista que
   * deixasse hoje de fora mandaria a pessoa conferir dois recortes para saber o
   * que fazer — que é o oposto de filtrar.
   */
  if (filter === 'week') return bucket === 'today' || bucket === 'week'

  return bucket === filter
}
