import { describe, expect, it } from 'vitest'

import type { TaskDto, TaskGroupDto } from '../schemas/task.schema'
import {
  DEFAULT_TASK_FILTERS,
  filterTaskGroups,
  hasActiveFilters,
  type TaskFilters,
} from './filterTasks'

/**
 * O recorte da lista de tarefas.
 *
 * Vivia dentro de `TasksScreen`, num `useMemo` com três auxiliares no fim do
 * arquivo. Só dava para verificar renderizando a tela e lendo o DOM — e é por
 * isso que as **combinações** nunca foram cobertas: elas custam caro pelo DOM, e
 * caro é o mesmo que não fazer.
 *
 * As combinações são o ponto. "Minhas" + "concluídas" + "esta semana" é a
 * pergunta que a recepção faz na sexta-feira, e ela é diferente de cada filtro
 * isolado.
 */

const USER = 'user-1'
const OTHER = 'user-2'

function task(overrides: Partial<TaskDto> & { id: string }): TaskDto {
  return {
    title: `Tarefa ${overrides.id}`,
    notes: null,
    status: 'pending',
    priority: 3,
    dueLabel: null,
    dueAt: null,
    assignee: null,
    target: null,
    ...overrides,
  }
}

function groups(...entries: TaskGroupDto[]): TaskGroupDto[] {
  return entries
}

const filters = (overrides: Partial<TaskFilters> = {}): TaskFilters => ({
  ...DEFAULT_TASK_FILTERS,
  ...overrides,
})

describe('status', () => {
  const todas = groups({
    bucket: 'today',
    tasks: [
      task({ id: 'pendente', status: 'pending' }),
      task({ id: 'andamento', status: 'in_progress' }),
      task({ id: 'concluida', status: 'done' }),
      task({ id: 'cancelada', status: 'canceled' }),
    ],
  })

  it('o padrão mostra só o que ainda pede alguma coisa', () => {
    const [group] = filterTaskGroups(todas, filters(), USER)

    expect(group.tasks.map((item) => item.id)).toEqual([
      'pendente',
      'andamento',
    ])
  })

  it('"concluídas" mostra só as concluídas', () => {
    const [group] = filterTaskGroups(todas, filters({ status: 'done' }), USER)

    expect(group.tasks.map((item) => item.id)).toEqual(['concluida'])
  })

  it('"todas" NÃO inclui cancelada', () => {
    /*
     * "Todas" quer dizer "tudo que aconteceu ou vai acontecer". Cancelada é a
     * decisão de NÃO fazer: não é trabalho pendente nem trabalho feito, e
     * contá-la no total faria a lista somar coisas que ninguém vai executar.
     */
    const [group] = filterTaskGroups(todas, filters({ status: 'all' }), USER)

    expect(group.tasks.map((item) => item.id)).not.toContain('cancelada')
    expect(group.tasks).toHaveLength(3)
  })
})

describe('responsável', () => {
  const todas = groups({
    bucket: 'today',
    tasks: [
      task({ id: 'minha', assignee: { id: USER, name: 'Eu' } }),
      task({ id: 'dela', assignee: { id: OTHER, name: 'Outra' } }),
      task({ id: 'sem-dono' }),
    ],
  })

  it('"minhas" traz só as atribuídas à sessão', () => {
    const [group] = filterTaskGroups(todas, filters({ assignee: 'mine' }), USER)

    expect(group.tasks.map((item) => item.id)).toEqual(['minha'])
  })

  it('"minhas" sem sessão não devolve NADA — e nunca tudo', () => {
    /*
     * O modo de falhar que importa: se a comparação deixasse `undefined`
     * casar com `null`, "minhas" passaria a significar "as sem dono". Se o
     * ramo caísse no `return true`, significaria "de todo mundo" — e a pessoa
     * agiria sobre tarefa alheia achando que era dela.
     */
    const resultado = filterTaskGroups(todas, filters({ assignee: 'mine' }), null)

    expect(resultado).toEqual([])
  })

  it('filtrar por um membro específico usa o id dele', () => {
    const [group] = filterTaskGroups(todas, filters({ assignee: OTHER }), USER)

    expect(group.tasks.map((item) => item.id)).toEqual(['dela'])
  })

  it('tarefa sem responsável não aparece em nenhum filtro de pessoa', () => {
    // Ela existe e é de todos — mas não é "de alguém", e um filtro por pessoa
    // que a trouxesse faria duas pessoas acharem que a tarefa é sua.
    const [group] = filterTaskGroups(todas, filters({ assignee: USER }), USER)

    expect(group.tasks.map((item) => item.id)).not.toContain('sem-dono')
  })
})

describe('prazo', () => {
  const todas = groups(
    { bucket: 'overdue', tasks: [task({ id: 'vencida' })] },
    { bucket: 'today', tasks: [task({ id: 'hoje' })] },
    { bucket: 'week', tasks: [task({ id: 'semana' })] },
    { bucket: 'undated', tasks: [task({ id: 'sem-prazo' })] },
  )

  it('"esta semana" INCLUI hoje', () => {
    /*
     * Quem filtra por semana está planejando os próximos dias. Uma lista que
     * deixasse hoje de fora mandaria a pessoa conferir dois recortes para
     * saber o que fazer — o oposto de filtrar.
     */
    const buckets = filterTaskGroups(todas, filters({ due: 'week' }), USER).map(
      (group) => group.bucket,
    )

    expect(buckets).toEqual(['today', 'week'])
  })

  it('"vencidas" traz só o grupo vencido', () => {
    const buckets = filterTaskGroups(
      todas,
      filters({ due: 'overdue' }),
      USER,
    ).map((group) => group.bucket)

    expect(buckets).toEqual(['overdue'])
  })

  it('o padrão mostra os quatro grupos', () => {
    expect(filterTaskGroups(todas, filters(), USER)).toHaveLength(4)
  })
})

describe('combinações', () => {
  const todas = groups(
    {
      bucket: 'overdue',
      tasks: [
        task({
          id: 'minha-vencida-feita',
          status: 'done',
          assignee: { id: USER, name: 'Eu' },
        }),
      ],
    },
    {
      bucket: 'today',
      tasks: [
        task({
          id: 'minha-hoje-feita',
          status: 'done',
          assignee: { id: USER, name: 'Eu' },
        }),
        task({
          id: 'dela-hoje-feita',
          status: 'done',
          assignee: { id: OTHER, name: 'Outra' },
        }),
        task({ id: 'minha-hoje-aberta', assignee: { id: USER, name: 'Eu' } }),
      ],
    },
  )

  it('minhas + concluídas + esta semana', () => {
    // A pergunta da sexta-feira: o que EU fechei nesta semana.
    const resultado = filterTaskGroups(
      todas,
      { status: 'done', assignee: 'mine', due: 'week' },
      USER,
    )

    expect(resultado).toHaveLength(1)
    expect(resultado[0].bucket).toBe('today')
    expect(resultado[0].tasks.map((item) => item.id)).toEqual([
      'minha-hoje-feita',
    ])
  })

  it('os três filtros são E, e não OU', () => {
    /*
     * Se fossem alternativos, o resultado acima traria também a vencida (minha
     * + concluída) e a da colega (concluída + semana). O acúmulo é o que faz
     * o recorte responder uma pergunta em vez de três.
     */
    const resultado = filterTaskGroups(
      todas,
      { status: 'done', assignee: 'mine', due: 'week' },
      USER,
    )

    const ids = resultado.flatMap((group) =>
      group.tasks.map((item) => item.id),
    )

    expect(ids).not.toContain('minha-vencida-feita')
    expect(ids).not.toContain('dela-hoje-feita')
  })
})

describe('forma do resultado', () => {
  it('grupo que ficou vazio não é devolvido', () => {
    // Cabeçalho "Vencidas" com nada embaixo se lê como coisa quebrada.
    const resultado = filterTaskGroups(
      groups(
        { bucket: 'overdue', tasks: [task({ id: 'a', status: 'done' })] },
        { bucket: 'today', tasks: [task({ id: 'b' })] },
      ),
      filters(),
      USER,
    )

    expect(resultado.map((group) => group.bucket)).toEqual(['today'])
  })

  it('a ordem é a do produto, e não a da entrada', () => {
    /*
     * Vencidas primeiro porque é o que gera ligação; sem prazo por último
     * porque não compete com nada. Herdar a ordem de quem chamou faria o
     * resultado depender do repositório.
     */
    const resultado = filterTaskGroups(
      groups(
        { bucket: 'undated', tasks: [task({ id: 'a' })] },
        { bucket: 'overdue', tasks: [task({ id: 'b' })] },
        { bucket: 'week', tasks: [task({ id: 'c' })] },
      ),
      filters(),
      USER,
    )

    expect(resultado.map((group) => group.bucket)).toEqual([
      'overdue',
      'week',
      'undated',
    ])
  })

  it('lista vazia devolve nenhum grupo', () => {
    expect(filterTaskGroups([], filters(), USER)).toEqual([])
  })

  it('não altera os grupos recebidos', () => {
    const entrada = groups({
      bucket: 'today',
      tasks: [task({ id: 'a' }), task({ id: 'b', status: 'done' })],
    })

    filterTaskGroups(entrada, filters(), USER)

    expect(entrada[0].tasks).toHaveLength(2)
  })
})

describe('hasActiveFilters', () => {
  it('o padrão não conta como filtro ativo', () => {
    /*
     * É o que separa "nenhuma tarefa ainda" de "nenhuma tarefa com esses
     * filtros" — dois vazios com ações opostas: o primeiro convida a criar, o
     * segundo a afrouxar o recorte.
     */
    expect(hasActiveFilters(DEFAULT_TASK_FILTERS)).toBe(false)
  })

  it.each([
    ['status', { status: 'all' as const }],
    ['responsável', { assignee: 'mine' }],
    ['prazo', { due: 'overdue' as const }],
  ])('mudar %s conta', (_nome, overrides) => {
    expect(hasActiveFilters(filters(overrides))).toBe(true)
  })
})
