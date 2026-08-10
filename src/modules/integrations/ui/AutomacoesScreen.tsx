'use client'

import { Info, Pencil, Plus, Trash2, Workflow } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { StatusBadge } from '@/components/ui/status-badge'
import { TextareaField } from '@/components/ui/textarea-field'
import { TextField } from '@/components/ui/text-field'
import type { MembershipRole, WorkflowTrigger } from '@/lib/supabase/database.types'

import {
  MAX_ACTIONS,
  triggerConfigKindFor,
  WORKFLOW_TRIGGERS,
  type AutomationAction,
  type AutomationTriggerConfig,
} from '../domain/Automation'
import {
  automationMessages,
  type AutomationRuleDto,
  type AutomationRuleFormValues,
} from '../schemas/automation.schema'
import { IntegrationStatusCard } from './IntegrationStatusCard'
import type { AutomacoesScreenProps } from './AutomacoesScreen.props'

const triggerLabels: Record<WorkflowTrigger, string> = {
  appointment_created: 'Consulta agendada',
  appointment_confirmed: 'Consulta confirmada',
  appointment_reminder: 'Lembrete de consulta',
  appointment_no_show: 'Paciente faltou',
  encounter_finished: 'Atendimento encerrado',
  invoice_issued: 'Fatura emitida',
  invoice_overdue: 'Fatura vencida',
  patient_birthday: 'Aniversário do paciente',
  schedule: 'Horário fixo',
}

const roleLabels: Record<MembershipRole, string> = {
  owner: 'Proprietário',
  admin: 'Administração',
  professional: 'Profissionais',
  receptionist: 'Recepção',
  finance: 'Financeiro',
}

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

interface FormState {
  name: string
  description: string
  triggerType: WorkflowTrigger
  hoursBefore: string
  time: string
  weekdays: number[]
  actionType: AutomationAction['type']
  roles: MembershipRole[]
  message: string
  taskTitle: string
  dueInDays: string
}

const emptyForm: FormState = {
  name: '',
  description: '',
  triggerType: 'appointment_reminder',
  hoursBefore: '24',
  time: '08:00',
  weekdays: [1, 2, 3, 4, 5],
  actionType: 'notify_team',
  roles: ['receptionist'],
  message: '',
  taskTitle: '',
  dueInDays: '1',
}

/**
 * Automações — cadastro real, execução inexistente.
 *
 * A tela anterior era só leitura, e a razão estava escrita no próprio vazio:
 * "o cadastro entra junto com o serviço que vai executá-las". A clínica passou
 * a poder cadastrar; o que **não** mudou é que nada executa. Por isso o aviso
 * de bloqueio continua no topo, o selo diz "marcada como ativa" em vez de
 * "ativa", e cada regra carrega a lembrança de que está guardada.
 *
 * O construtor é deliberadamente estreito. `trigger_config`, `conditions` e
 * `actions` são `jsonb`, e um campo de texto livre para JSON transformaria esta
 * tela num canal para gravar estrutura arbitrária no tenant — que o worker
 * futuro leria como instrução. Só existe o que o formulário sabe montar.
 */
export function AutomacoesScreen({
  status,
  rules,
  onSubmitRule,
  onToggleRule,
  onDeleteRule,
  canMutate,
  loadError = null,
}: AutomacoesScreenProps) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AutomationRuleDto | null>(null)
  const [confirming, setConfirming] = useState<AutomationRuleDto | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const configKind = triggerConfigKindFor(form.triggerType)

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError(null)
    setModalOpen(true)
  }

  function openEdit(rule: AutomationRuleDto) {
    const action = rule.actions[0]
    setEditing(rule)
    setForm({
      name: rule.name,
      description: rule.description ?? '',
      triggerType: rule.triggerType,
      hoursBefore:
        rule.triggerConfig.kind === 'reminder' ? String(rule.triggerConfig.hoursBefore) : '24',
      time: rule.triggerConfig.kind === 'schedule' ? rule.triggerConfig.time : '08:00',
      weekdays:
        rule.triggerConfig.kind === 'schedule' ? [...rule.triggerConfig.weekdays] : [1, 2, 3, 4, 5],
      actionType: action?.type ?? 'notify_team',
      roles: action?.type === 'notify_team' ? [...action.roles] : ['receptionist'],
      message: action?.type === 'notify_team' ? action.message : '',
      taskTitle: action?.type === 'create_task' ? action.title : '',
      dueInDays: action?.type === 'create_task' ? String(action.dueInDays) : '1',
    })
    setError(null)
    setModalOpen(true)
  }

  function closeModal(force = false) {
    if (saving && !force) return
    setModalOpen(false)
    setEditing(null)
    setConfirming(null)
    setForm(emptyForm)
    setError(null)
  }

  function buildTriggerConfig(): AutomationTriggerConfig | null {
    if (configKind === 'event') return { kind: 'event' }
    if (configKind === 'reminder') {
      const hoursBefore = Number(form.hoursBefore)
      if (!Number.isInteger(hoursBefore) || hoursBefore < 1 || hoursBefore > 168) return null
      return { kind: 'reminder', hoursBefore }
    }
    if (form.weekdays.length === 0) return null
    return { kind: 'schedule', time: form.time, weekdays: form.weekdays }
  }

  function buildAction(): AutomationAction | null {
    if (form.actionType === 'notify_team') {
      if (form.roles.length === 0 || form.message.trim().length < 3) return null
      return { type: 'notify_team', roles: form.roles, message: form.message.trim() }
    }
    const dueInDays = Number(form.dueInDays)
    if (form.taskTitle.trim().length < 3) return null
    if (!Number.isInteger(dueInDays) || dueInDays < 0 || dueInDays > 90) return null
    return { type: 'create_task', title: form.taskTitle.trim(), dueInDays }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const triggerConfig = buildTriggerConfig()
    if (!triggerConfig) {
      setError(
        configKind === 'reminder'
          ? automationMessages.hoursBeforeInvalid
          : automationMessages.weekdaysRequired,
      )
      return
    }

    // Uma regra sem ação não faz nada — nem quando o worker existir.
    const action = buildAction()
    if (!action) {
      setError(
        form.actionType === 'notify_team'
          ? automationMessages.messageRequired
          : automationMessages.taskTitleRequired,
      )
      return
    }

    const values: AutomationRuleFormValues = {
      name: form.name.trim(),
      description: form.description,
      triggerType: form.triggerType,
      triggerConfig,
      conditions: [],
      actions: [action],
      isActive: editing?.isActive ?? false,
    }

    setSaving(true)
    try {
      const failure = await onSubmitRule(values, editing?.id ?? null)
      if (failure) {
        setError(failure)
        return
      }
      closeModal(true)
      router.refresh()
    } catch {
      setError(automationMessages.unavailable)
    } finally {
      setSaving(false)
    }
  }

  async function run(ruleId: string, operation: () => Promise<string | null>) {
    setBusyId(ruleId)
    setError(null)
    try {
      const failure = await operation()
      if (failure) setError(failure)
      else {
        setConfirming(null)
        router.refresh()
      }
    } catch {
      setError(automationMessages.unavailable)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Produtividade"
        title="Automações"
        description="Regras que a clínica cadastra, e o que ainda falta para executá-las."
        actions={
          <Button onClick={openCreate} disabled={!canMutate}>
            <Plus aria-hidden className="size-4" />
            Nova regra
          </Button>
        }
      />

      <IntegrationStatusCard
        title="Execução de automações"
        purpose="Disparar lembrete de consulta, pedido de confirmação e recuperação de paciente sem alguém lembrar de fazer."
        state="absent"
        blockedBy="Não há serviço de execução instalado. As regras abaixo são gravadas no banco e ficam guardadas: nenhuma delas dispara, mesmo marcada como ativa. A execução depende do mesmo serviço de fila que o WhatsApp precisa."
      />

      {loadError ? (
        <div
          role="alert"
          className="rounded-card border border-status-negative/25 bg-status-negative-surface px-4 py-3 text-aux text-status-negative"
        >
          {loadError}
        </div>
      ) : null}

      {error && !modalOpen && !confirming ? (
        <div
          role="alert"
          className="rounded-card border border-status-negative/25 bg-status-negative-surface px-4 py-3 text-aux text-status-negative"
        >
          {error}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="px-5 pt-5">
          <h2 className="text-card-title font-semibold text-foreground">Regras cadastradas</h2>
          <p className="mt-1 text-aux text-muted">
            Gravadas em <code>workflows</code>. Nenhuma é executada hoje.
          </p>
        </div>

        {rules.length === 0 ? (
          <EmptyState
            icon={Workflow}
            title="Nenhuma regra cadastrada."
            description="Cadastre a regra agora e ela fica pronta para quando o serviço de execução existir. Até lá, nada dispara."
            action={
              <Button onClick={openCreate} disabled={!canMutate}>
                <Plus aria-hidden className="size-4" />
                Nova regra
              </Button>
            }
          />
        ) : (
          <ul className="mt-4 divide-y divide-border-card border-t border-border-card">
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-aux font-semibold text-foreground">{rule.name}</p>
                  <p className="truncate text-label text-muted">
                    {triggerLabels[rule.triggerType]} · {describeConfig(rule.triggerConfig)} ·{' '}
                    {describeActions(rule.actions)}
                  </p>
                  <p className="truncate text-label text-muted">
                    {rule.lastRunAt ? `Última execução ${rule.lastRunAt}` : 'Nunca executada'}
                  </p>
                </div>

                {/*
                  `is_active` é o que está no banco — não uma promessa de que a
                  regra dispara. Sem executor, "ativa" significa apenas
                  "marcada para quando houver".
                */}
                <StatusBadge tone={rule.isActive ? 'pending' : 'negative'}>
                  {rule.isActive ? 'Marcada como ativa' : 'Desligada'}
                </StatusBadge>

                {canMutate ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => void run(rule.id, () => onToggleRule(rule.id, !rule.isActive))}
                      disabled={busyId === rule.id}
                    >
                      {rule.isActive ? 'Desligar' : 'Marcar como ativa'}
                    </Button>
                    <Button variant="ghost" onClick={() => openEdit(rule)} disabled={busyId === rule.id}>
                      <Pencil aria-hidden className="size-4" />
                      Editar
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirming(rule)} disabled={busyId === rule.id}>
                      <Trash2 aria-hidden className="size-4" />
                      Excluir
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="flex items-start gap-2.5 text-label text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {status.runs === 0
          ? 'Nenhuma execução registrada — e não haveria como haver: o serviço que executaria as regras não faz parte desta instalação.'
          : `${status.runs} execuções registradas em workflow_runs.`}
      </p>

      <Modal
        open={modalOpen}
        onOpenChange={(open) => (open ? setModalOpen(true) : closeModal())}
        title={editing ? 'Editar regra' : 'Nova regra'}
        description="A regra é gravada no banco e não dispara: não há serviço de execução instalado."
        footer={
          <>
            <Button variant="secondary" onClick={() => closeModal()} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" form="automation-form" isLoading={saving}>
              Salvar regra
            </Button>
          </>
        }
      >
        <form id="automation-form" className="flex flex-col gap-4" onSubmit={submit} noValidate>
          {error ? (
            <div
              role="alert"
              className="rounded-field border border-status-negative/25 bg-status-negative-surface px-3 py-2 text-label text-status-negative"
            >
              {error}
            </div>
          ) : null}

          <TextField
            label="Nome da regra"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Ex.: Lembrar recepção da consulta de amanhã"
            required
          />

          <SelectField
            label="Gatilho"
            value={form.triggerType}
            onChange={(event) =>
              setForm((current) => ({ ...current, triggerType: event.target.value as WorkflowTrigger }))
            }
            options={WORKFLOW_TRIGGERS.map((trigger) => ({
              value: trigger,
              label: triggerLabels[trigger],
            }))}
          />

          {configKind === 'reminder' ? (
            <TextField
              label="Antecedência em horas"
              type="number"
              min={1}
              max={168}
              value={form.hoursBefore}
              onChange={(event) =>
                setForm((current) => ({ ...current, hoursBefore: event.target.value }))
              }
              hint="De 1 a 168 horas (sete dias)."
            />
          ) : null}

          {configKind === 'schedule' ? (
            <>
              <TextField
                label="Horário"
                type="time"
                value={form.time}
                onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))}
              />
              <fieldset className="flex flex-col gap-2">
                <legend className="text-label font-semibold text-foreground">Dias da semana</legend>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_LABELS.map((label, index) => (
                    <label key={label} className="flex items-center gap-1.5 text-label text-muted">
                      <input
                        type="checkbox"
                        checked={form.weekdays.includes(index)}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            weekdays: event.target.checked
                              ? [...current.weekdays, index]
                              : current.weekdays.filter((day) => day !== index),
                          }))
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          ) : null}

          <SelectField
            label="Ação"
            value={form.actionType}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                actionType: event.target.value as AutomationAction['type'],
              }))
            }
            options={[
              { value: 'notify_team', label: 'Notificar a equipe' },
              { value: 'create_task', label: 'Abrir tarefa' },
            ]}
            hint="Só ações internas. Envio por WhatsApp, e-mail ou webhook depende de serviço externo que não existe aqui."
          />

          {form.actionType === 'notify_team' ? (
            <>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-label font-semibold text-foreground">Notificar</legend>
                <div className="flex flex-wrap gap-3">
                  {(Object.keys(roleLabels) as MembershipRole[]).map((role) => (
                    <label key={role} className="flex items-center gap-1.5 text-label text-muted">
                      <input
                        type="checkbox"
                        checked={form.roles.includes(role)}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            roles: event.target.checked
                              ? [...current.roles, role]
                              : current.roles.filter((item) => item !== role),
                          }))
                        }
                      />
                      {roleLabels[role]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <TextareaField
                label="Mensagem"
                value={form.message}
                onChange={(event) =>
                  setForm((current) => ({ ...current, message: event.target.value }))
                }
                placeholder="Texto que a equipe verá na notificação interna."
              />
            </>
          ) : (
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
              <TextField
                label="Título da tarefa"
                value={form.taskTitle}
                onChange={(event) =>
                  setForm((current) => ({ ...current, taskTitle: event.target.value }))
                }
              />
              <TextField
                label="Prazo em dias"
                type="number"
                min={0}
                max={90}
                value={form.dueInDays}
                onChange={(event) =>
                  setForm((current) => ({ ...current, dueInDays: event.target.value }))
                }
              />
            </div>
          )}

          <TextareaField
            label="Observações (opcional)"
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
          />

          <p className="text-label text-muted">
            Uma ação por regra nesta versão (o banco aceita até {MAX_ACTIONS}); nenhuma delas é
            executada enquanto não houver serviço de execução.
          </p>
        </form>
      </Modal>

      <Modal
        open={Boolean(confirming)}
        onOpenChange={(open) => (open ? undefined : setConfirming(null))}
        title="Excluir regra?"
        description="A regra some da lista. Se já houver execuções registradas, o banco recusa a exclusão e a saída é desligá-la."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={busyId !== null}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                confirming ? void run(confirming.id, () => onDeleteRule(confirming.id)) : undefined
              }
              isLoading={busyId !== null}
            >
              Excluir regra
            </Button>
          </>
        }
      >
        {error ? (
          <div
            role="alert"
            className="mb-3 rounded-field border border-status-negative/25 bg-status-negative-surface px-3 py-2 text-label text-status-negative"
          >
            {error}
          </div>
        ) : null}
        <p className="text-aux text-muted">{confirming?.name}</p>
      </Modal>
    </div>
  )
}

function describeConfig(config: AutomationTriggerConfig): string {
  if (config.kind === 'reminder') return `${config.hoursBefore}h antes`
  if (config.kind === 'schedule') {
    return `${config.time} · ${config.weekdays.map((day) => WEEKDAY_LABELS[day]).join(', ')}`
  }
  return 'no evento'
}

function describeActions(actions: readonly AutomationAction[]): string {
  if (actions.length === 0) return 'sem ação'
  return actions
    .map((action) =>
      action.type === 'notify_team'
        ? `notificar ${action.roles.map((role) => roleLabels[role]).join(', ')}`
        : `abrir tarefa "${action.title}"`,
    )
    .join(' · ')
}
