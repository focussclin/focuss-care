'use client'

import {
  CalendarClock,
  Check,
  CheckSquare2,
  CircleAlert,
  Edit3,
  Filter,
  Info,
  Plus,
  RotateCcw,
  ShieldAlert,
  UserRound,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type FormEvent } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { TextareaField } from '@/components/ui/textarea-field'
import { TextField } from '@/components/ui/text-field'
import { cn } from '@/lib/utils/cn'

import { taskMessages, type TaskDto, type TaskFormValues } from '../schemas/task.schema'
import type { TaskBucket } from '../domain/Task'
/*
 * O recorte da lista mora em `application/filterTasks`, e não aqui.
 *
 * Ele era um `useMemo` com três funções auxiliares no fim deste arquivo:
 * funcionava, e só dava para verificar renderizando a tela e lendo o DOM. As
 * combinações são o que importa — "minhas" + "concluídas" + "esta semana" é a
 * pergunta que a recepção faz na sexta-feira, e é diferente de cada filtro
 * isolado —, e cobri-las pelo DOM sai caro o bastante para não ser feito.
 */
import {
  DEFAULT_TASK_FILTERS,
  filterTaskGroups,
  hasActiveFilters,
  type AssigneeFilter,
  type DueFilter,
  type StatusFilter,
} from '../application/filterTasks'
import type { TasksScreenProps } from './TasksScreen.props'

interface TaskFormState {
  title: string
  notes: string
  assigneeId: string
  dueAt: string
  priority: string
  patientId: string
}

const emptyForm: TaskFormState = {
  title: '',
  notes: '',
  assigneeId: '',
  dueAt: '',
  priority: '3',
  patientId: '',
}

const groupMeta: Record<
  TaskBucket,
  { label: string; description: string; tone?: 'danger' }
> = {
  overdue: {
    label: 'Vencidas',
    description: 'Pendências que precisam de atenção primeiro.',
    tone: 'danger',
  },
  today: {
    label: 'Hoje',
    description: 'O que ainda precisa acontecer até o fim do dia.',
  },
  week: {
    label: 'Esta semana',
    description: 'Próximos compromissos da equipe.',
  },
  undated: {
    label: 'Sem prazo',
    description: 'Tarefas sem data definida.',
  },
}

const statusMeta: Record<
  TaskDto['status'],
  { label: string; tone: StatusTone }
> = {
  pending: { label: 'Pendente', tone: 'pending' },
  in_progress: { label: 'Em andamento', tone: 'positive' },
  done: { label: 'Concluída', tone: 'neutral' },
  canceled: { label: 'Cancelada', tone: 'negative' },
}

const priorityMeta: Record<number, { label: string; className: string }> = {
  1: { label: 'Alta', className: 'text-danger' },
  3: { label: 'Normal', className: 'text-muted' },
  5: { label: 'Baixa', className: 'text-muted' },
}


export function TasksScreen({
  groups,
  assignees,
  patients,
  currentUserId,
  onSubmit,
  onToggleDone,
  onCancel,
  isLive,
  schemaPending = false,
}: TasksScreenProps) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<TaskDto | null>(null)
  const [confirming, setConfirming] = useState<TaskDto | null>(null)
  const [form, setForm] = useState<TaskFormState>(emptyForm)
  /*
   * O recorte inicial vem de `DEFAULT_TASK_FILTERS`, e não de literais aqui.
   *
   * `hasActiveFilters` compara com essa mesma constante para decidir entre
   * "nenhuma tarefa ainda" e "nenhuma tarefa com esses filtros" — dois vazios
   * com ações opostas. Com o padrão escrito em dois lugares, mudar um deles
   * faria a tela abrir já dizendo que há filtros ativos.
   */
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>(
    DEFAULT_TASK_FILTERS.assignee,
  )
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    DEFAULT_TASK_FILTERS.status,
  )
  const [dueFilter, setDueFilter] = useState<DueFilter>(
    DEFAULT_TASK_FILTERS.due,
  )
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setSubmitting] = useState(false)
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null)
  const [recentCompletion, setRecentCompletion] = useState<{
    id: string
    title: string
  } | null>(null)

  const allTasks = useMemo(() => groups.flatMap((group) => group.tasks), [groups])
  const canMutate = isLive && !schemaPending
  const hasAnyTasks = allTasks.length > 0
  const hasFilters = hasActiveFilters({
    status: statusFilter,
    assignee: assigneeFilter,
    due: dueFilter,
  })

  const visibleGroups = useMemo(
    () =>
      filterTaskGroups(
        groups,
        { status: statusFilter, assignee: assigneeFilter, due: dueFilter },
        currentUserId,
      ),
    [assigneeFilter, currentUserId, dueFilter, groups, statusFilter],
  )

  useEffect(() => {
    if (!recentCompletion) return
    const timeout = window.setTimeout(() => setRecentCompletion(null), 5000)
    return () => window.clearTimeout(timeout)
  }, [recentCompletion])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError(null)
    setModalOpen(true)
  }

  function openEdit(task: TaskDto) {
    setEditing(task)
    setForm({
      title: task.title,
      notes: task.notes ?? '',
      assigneeId: task.assignee?.id ?? '',
      dueAt: task.dueAt?.slice(0, 10) ?? '',
      priority: String(task.priority),
      patientId: patientIdFromTarget(task),
    })
    setError(null)
    setModalOpen(true)
  }

  function closeForm(force = false) {
    if (isSubmitting && !force) return
    setModalOpen(false)
    setEditing(null)
    setForm(emptyForm)
    setError(null)
  }

  function clearFilters() {
    setAssigneeFilter('all')
    setStatusFilter('open')
    setDueFilter('all')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const title = form.title.trim()
    const notes = form.notes.trim()
    if (title.length < 3) {
      setError(taskMessages.titleRequired)
      return
    }
    if (title.length > 140) {
      setError(taskMessages.titleTooLong)
      return
    }
    if (notes.length > 1000) {
      setError(taskMessages.notesTooLong)
      return
    }

    setSubmitting(true)
    try {
      const values: TaskFormValues = {
        title,
        notes,
        assigneeId: form.assigneeId || null,
        dueAt: form.dueAt || null,
        priority: Number(form.priority),
        patientId: form.patientId || null,
      }
      const failure = await onSubmit(values, editing?.id ?? null)
      if (failure) {
        setError(failure)
        return
      }

      closeForm(true)
      router.refresh()
    } catch {
      setError(taskMessages.unavailable)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggle(task: TaskDto, done: boolean) {
    setError(null)
    setBusyTaskId(task.id)
    try {
      const failure = await onToggleDone(task.id, done)
      if (failure) {
        setError(failure)
        return
      }

      if (done) setRecentCompletion({ id: task.id, title: task.title })
      else setRecentCompletion(null)
      router.refresh()
    } catch {
      setError(taskMessages.unavailable)
    } finally {
      setBusyTaskId(null)
    }
  }

  async function handleCancel() {
    if (!confirming) return

    setError(null)
    setBusyTaskId(confirming.id)
    try {
      const failure = await onCancel(confirming.id)
      if (failure) {
        setError(failure)
        return
      }

      setConfirming(null)
      router.refresh()
    } catch {
      setError(taskMessages.unavailable)
    } finally {
      setBusyTaskId(null)
    }
  }

  const emptyTitle = !hasAnyTasks
    ? 'Ainda não há tarefas.'
    : !hasFilters && statusFilter === 'open'
      ? 'Nada pendente por aqui.'
      : 'Nenhuma tarefa com esses filtros.'
  const emptyDescription = !hasAnyTasks
    ? 'Quando alguém da equipe anotar algo para fazer, aparece nesta lista.'
    : !hasFilters && statusFilter === 'open'
      ? 'Quando uma pendência surgir, ela aparece aqui para a equipe agir.'
      : 'Ajuste os filtros para encontrar outras tarefas.'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Inteligência"
        title="Tarefas"
        description="O que a equipe combinou de fazer, e o que ainda está aberto."
        actions={
          <Button
            onClick={openCreate}
            disabled={!canMutate}
            title={
              schemaPending
                ? 'A migration de tarefas ainda precisa ser aplicada.'
                : !isLive
                  ? 'Disponível quando o Supabase estiver configurado.'
                  : undefined
            }
          >
            <Plus aria-hidden className="size-4" />
            Nova tarefa
          </Button>
        }
      />

      {schemaPending ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-card border border-status-pending/25 bg-status-pending-surface px-4 py-3 text-aux text-status-pending"
        >
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Tarefas ainda não conectadas ao banco</p>
            <p className="mt-0.5 text-label">
              A interface está pronta, mas a migration{' '}
              <code>20260809_clinic_tasks.sql</code> ainda precisa ser aplicada no
              projeto Supabase antes de salvar tarefas.
            </p>
          </div>
        </div>
      ) : !isLive ? (
        <div
          role="status"
          className="rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted"
        >
          Modo demonstração: nenhuma tarefa será salva sem o Supabase configurado.
        </div>
      ) : null}

      {error && !modalOpen && !confirming ? (
        <p
          role="alert"
          className="rounded-card border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
        >
          {error}
        </p>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex items-start gap-3 border-b border-border-card px-4 py-4 sm:px-5">
          <Filter aria-hidden className="mt-1 size-4 shrink-0 text-link" />
          <div className="min-w-0">
            <p className="text-aux font-semibold text-foreground">Filtrar tarefas</p>
            <p className="mt-0.5 text-label text-muted">
              Abertas é o ponto de partida para a operação diária.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-3 px-4 py-4 sm:px-5">
            <div className="w-48">
              <SelectField
                label="Responsável"
                value={assigneeFilter}
                onChange={(event) => setAssigneeFilter(event.target.value)}
                options={[
                  { value: 'all', label: 'Todas' },
                  ...(currentUserId
                    ? [{ value: 'mine', label: 'Minhas' }]
                    : []),
                  ...assignees.map((assignee) => ({
                    value: assignee.id,
                    label: assignee.name,
                  })),
                ]}
              />
            </div>
            <div className="w-44">
              <SelectField
                label="Situação"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
                options={[
                  { value: 'open', label: 'Abertas' },
                  { value: 'done', label: 'Concluídas' },
                  { value: 'all', label: 'Todas' },
                ]}
              />
            </div>
            <div className="w-44">
              <SelectField
                label="Prazo"
                value={dueFilter}
                onChange={(event) => setDueFilter(event.target.value as DueFilter)}
                options={[
                  { value: 'all', label: 'Todos' },
                  { value: 'overdue', label: 'Vencidas' },
                  { value: 'today', label: 'Hoje' },
                  { value: 'week', label: 'Esta semana' },
                ]}
              />
            </div>
            {hasFilters ? (
              <Button
                variant="ghost"
                className="mt-6"
                onClick={clearFilters}
              >
                <RotateCcw aria-hidden className="size-4" />
                Limpar filtros
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {visibleGroups.length === 0 ? (
        <Card>
          <EmptyState
            icon={hasAnyTasks ? CircleAlert : CheckSquare2}
            title={emptyTitle}
            description={emptyDescription}
            action={
              !hasAnyTasks ? (
                <Button onClick={openCreate} disabled={!canMutate}>
                  <Plus aria-hidden className="size-4" />
                  Criar primeira tarefa
                </Button>
              ) : hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {visibleGroups.map((group) => (
            <TaskGroup
              key={group.bucket}
              bucket={group.bucket}
              tasks={group.tasks}
              busyTaskId={busyTaskId}
              onEdit={openEdit}
              onToggle={handleToggle}
              onCancel={setConfirming}
            />
          ))}
        </div>
      )}

      {recentCompletion ? (
        <div
          role="status"
          className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-card bg-surface px-4 py-3 shadow-raised"
        >
          <span className="flex min-w-0 items-center gap-2 text-aux text-foreground">
            <Check aria-hidden className="size-4 shrink-0 text-status-positive" />
            <span className="truncate">Tarefa concluída: {recentCompletion.title}</span>
          </span>
          <Button
            variant="ghost"
            onClick={() => {
              const task = allTasks.find((item) => item.id === recentCompletion.id)
              if (task) void handleToggle(task, false)
            }}
            disabled={busyTaskId === recentCompletion.id}
          >
            Desfazer
          </Button>
        </div>
      ) : null}

      <div className="flex items-start gap-2 text-label text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <p>
          Tarefas são coordenação da equipe. A geração automática por IA e as
          notificações serão conectadas quando os respectivos módulos existirem.
        </p>
      </div>

      <Modal
        open={modalOpen}
        onOpenChange={(open) => (open ? setModalOpen(true) : closeForm())}
        title={editing ? 'Editar tarefa' : 'Nova tarefa'}
        description="Registre uma ação clara para a equipe executar."
        footer={
          <>
            <Button variant="secondary" onClick={() => closeForm()} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" form="task-form" isLoading={isSubmitting}>
              {isSubmitting ? 'Salvando…' : editing ? 'Salvar alterações' : 'Salvar tarefa'}
            </Button>
          </>
        }
      >
        <form id="task-form" noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error ? (
            <p
              role="alert"
              className="rounded-card border border-danger/30 bg-danger-surface px-3.5 py-2.5 text-aux text-danger"
            >
              {error}
            </p>
          ) : null}

          <TextField
            label="O que precisa ser feito"
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="Ex.: Ligar para confirmar o retorno de Maria"
            maxLength={140}
            required
            autoFocus
          />

          <TextareaField
            label="Detalhes"
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            hint="Opcional. Inclua contexto para quem vai executar."
            maxLength={1000}
            rows={3}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Responsável"
              value={form.assigneeId}
              onChange={(event) => setForm((current) => ({ ...current, assigneeId: event.target.value }))}
              options={[
                { value: '', label: 'Sem responsável' },
                ...assignees.map((assignee) => ({ value: assignee.id, label: assignee.name })),
              ]}
            />

            <TextField
              label="Prazo"
              type="date"
              value={form.dueAt}
              onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Prioridade"
              value={form.priority}
              onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}
              options={[
                { value: '3', label: 'Normal' },
                { value: '1', label: 'Alta' },
                { value: '5', label: 'Baixa' },
              ]}
            />

            <SelectField
              label="Relacionado a"
              value={form.patientId}
              onChange={(event) => setForm((current) => ({ ...current, patientId: event.target.value }))}
              options={[
                { value: '', label: 'Nenhum paciente' },
                ...patients.map((patient) => ({ value: patient.id, label: patient.name })),
              ]}
            />
          </div>

          {patients.length === 0 ? (
            <p className="text-label text-muted">
              Nenhum paciente ativo disponível para relacionar nesta sessão.
            </p>
          ) : null}
        </form>
      </Modal>

      <Modal
        open={Boolean(confirming)}
        onOpenChange={(open) => {
          if (!open && !busyTaskId) setConfirming(null)
        }}
        title="Cancelar tarefa?"
        description={confirming?.title}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={Boolean(busyTaskId)}>
              Manter tarefa
            </Button>
            <Button variant="danger" onClick={handleCancel} isLoading={Boolean(busyTaskId)}>
              Cancelar tarefa
            </Button>
          </>
        }
      >
        {error ? (
          <p
            role="alert"
            className="mb-4 rounded-card border border-danger/30 bg-danger-surface px-3.5 py-2.5 text-aux text-danger"
          >
            {error}
          </p>
        ) : null}
        <p className="text-aux leading-6 text-muted">
          A tarefa será marcada como cancelada e deixará de aparecer nas pendências.
          O registro continua preservado para auditoria.
        </p>
      </Modal>
    </div>
  )
}

interface TaskGroupProps {
  bucket: TaskBucket
  tasks: readonly TaskDto[]
  busyTaskId: string | null
  onEdit: (task: TaskDto) => void
  onToggle: (task: TaskDto, done: boolean) => Promise<void>
  onCancel: (task: TaskDto) => void
}

function TaskGroup({ bucket, tasks, busyTaskId, onEdit, onToggle, onCancel }: TaskGroupProps) {
  const meta = groupMeta[bucket]

  return (
    <section aria-labelledby={`tasks-${bucket}`}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2
            id={`tasks-${bucket}`}
            className={cn('text-body font-semibold', meta.tone === 'danger' ? 'text-danger' : 'text-foreground')}
          >
            {meta.label}
          </h2>
          <p className="text-label text-muted">{meta.description}</p>
        </div>
        <span className="text-label text-muted">
          {tasks.length} {tasks.length === 1 ? 'tarefa' : 'tarefas'}
        </span>
      </div>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-border-card">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              busy={busyTaskId === task.id}
              onEdit={onEdit}
              onToggle={onToggle}
              onCancel={onCancel}
            />
          ))}
        </ul>
      </Card>
    </section>
  )
}

interface TaskRowProps {
  task: TaskDto
  busy: boolean
  onEdit: (task: TaskDto) => void
  onToggle: (task: TaskDto, done: boolean) => Promise<void>
  onCancel: (task: TaskDto) => void
}

function TaskRow({ task, busy, onEdit, onToggle, onCancel }: TaskRowProps) {
  const priority = priorityMeta[task.priority] ?? priorityMeta[3]
  const status = statusMeta[task.status]
  const canComplete = task.status !== 'canceled'

  return (
    <li className="flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-row-hover sm:px-5">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={task.status === 'done'}
          onChange={(event) => void onToggle(task, event.target.checked)}
          disabled={busy || !canComplete}
          aria-label={`Concluir: ${task.title}`}
          className="mt-1 size-5 shrink-0 cursor-pointer accent-brand disabled:cursor-not-allowed disabled:opacity-50"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
            <p
              className={cn(
                'min-w-0 flex-1 text-aux font-semibold text-foreground',
                task.status === 'done' && 'text-muted line-through',
              )}
            >
              {task.title}
            </p>
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-label text-muted">
            {task.target ? (
              <Link href={task.target.href} className="font-semibold text-link hover:underline">
                {task.target.label}
              </Link>
            ) : null}
            {task.dueLabel ? (
              <span
                title={task.dueAt ? new Date(task.dueAt).toLocaleString('pt-BR') : undefined}
                className={cn(
                  'inline-flex items-center gap-1',
                  task.dueLabel.startsWith('venceu') && 'font-semibold text-danger',
                )}
              >
                <CalendarClock aria-hidden className="size-3.5" />
                {task.dueLabel}
              </span>
            ) : null}
            <span className={cn('inline-flex items-center gap-1', priority.className)}>
              <CircleAlert aria-hidden className="size-3.5" />
              {priority.label}
            </span>
          </div>

          {task.notes ? <p className="mt-2 line-clamp-2 text-label text-muted">{task.notes}</p> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pl-8 sm:pl-8">
        <div className="flex min-w-0 items-center gap-2 text-label text-muted">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-link">
            {task.assignee ? initials(task.assignee.name) : <UserRound aria-hidden className="size-3.5" />}
          </span>
          <span className="truncate">{task.assignee?.name ?? 'Sem responsável'}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            className="h-9 px-3 text-label"
            onClick={() => onEdit(task)}
            disabled={busy}
          >
            <Edit3 aria-hidden className="size-3.5" />
            Editar
          </Button>
          {task.status !== 'done' && task.status !== 'canceled' ? (
            <Button
              variant="ghost"
              className="h-9 px-3 text-label text-danger hover:bg-danger-surface"
              onClick={() => onCancel(task)}
              disabled={busy}
            >
              <XCircle aria-hidden className="size-3.5" />
              Cancelar
            </Button>
          ) : null}
          {task.status === 'done' ? (
            <span className="sr-only">Use a caixa de seleção para reabrir esta tarefa.</span>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function patientIdFromTarget(task: TaskDto): string {
  const match = task.target?.href.match(/^\/pacientes\/([^/]+)$/)
  return match?.[1] ?? ''
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
