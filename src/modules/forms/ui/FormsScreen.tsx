'use client'

import {
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Check,
  FileText,
  Info,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { TextareaField } from '@/components/ui/textarea-field'
import { TextField } from '@/components/ui/text-field'
import {
  type FormFieldType,
  type FormStatus,
  type FormType,
} from '../domain/Form'
import { formMessages } from '../schemas/form.schema'
import type { FormDto, FormFieldDto, FormFormValues } from '../schemas/form.schema'
import type { FormsScreenProps } from './FormsScreen.props'

const typeOptions = [
  { value: 'intake', label: 'Cadastro e pré-atendimento' },
  { value: 'anamnesis', label: 'Anamnese' },
  { value: 'consent', label: 'Consentimento' },
  { value: 'feedback', label: 'Pesquisa de satisfação' },
  { value: 'custom', label: 'Personalizado' },
] as const

const fieldTypeOptions = [
  { value: 'text', label: 'Texto curto' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Data' },
  { value: 'select', label: 'Seleção única' },
  { value: 'checkbox', label: 'Caixas de seleção' },
  { value: 'radio', label: 'Opções' },
  { value: 'scale', label: 'Escala' },
  { value: 'signature', label: 'Assinatura' },
  { value: 'upload', label: 'Upload de arquivo' },
] as const

const statusMeta: Record<FormStatus, { label: string; tone: StatusTone }> = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  published: { label: 'Publicado', tone: 'positive' },
  archived: { label: 'Arquivado', tone: 'negative' },
}

const typeLabel = new Map<FormType, string>(
  typeOptions.map((option) => [option.value, option.label]),
)

interface FormState {
  name: string
  description: string
  type: FormType
  status: FormStatus
  fields: FormFieldDto[]
}

const emptyForm: FormState = {
  name: '',
  description: '',
  type: 'custom',
  status: 'draft',
  fields: [],
}

export function FormsScreen({
  forms,
  onSubmit,
  onSetStatus,
  isLive,
  schemaPending = false,
}: FormsScreenProps) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<FormDto | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setSubmitting] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const canMutate = isLive && !schemaPending

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError(null)
    setModalOpen(true)
  }

  function openEdit(item: FormDto) {
    setEditing(item)
    setForm({
      name: item.name,
      description: item.description ?? '',
      type: item.type,
      status: item.status,
      fields: item.fields.map((field) => ({ ...field, options: [...field.options] })),
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

  function addField() {
    setForm((current) => ({
      ...current,
      fields: [
        ...current.fields,
        {
          id: createFieldId(),
          label: '',
          type: 'text',
          required: false,
          helpText: null,
          options: [],
        },
      ],
    }))
  }

  function updateField(fieldId: string, patch: Partial<FormFieldDto>) {
    setForm((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.id === fieldId ? { ...field, ...patch } : field,
      ),
    }))
  }

  function removeField(fieldId: string) {
    setForm((current) => ({
      ...current,
      fields: current.fields.filter((field) => field.id !== fieldId),
    }))
  }

  function moveField(fieldId: string, direction: -1 | 1) {
    setForm((current) => {
      const index = current.fields.findIndex((field) => field.id === fieldId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= current.fields.length) return current

      const fields = [...current.fields]
      const [field] = fields.splice(index, 1)
      fields.splice(nextIndex, 0, field)
      return { ...current, fields }
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (form.name.trim().length < 2) {
      setError(formMessages.nameRequired)
      return
    }
    if (form.fields.length === 0) {
      setError(formMessages.fieldsRequired)
      return
    }
    if (form.fields.some((field) => field.label.trim().length === 0)) {
      setError(formMessages.fieldLabelRequired)
      return
    }

    setSubmitting(true)
    try {
      const values: FormFormValues = {
        name: form.name,
        description: form.description,
        type: form.type,
        status: form.status,
        fields: form.fields,
      }
      const failure = await onSubmit(values, editing?.id ?? null)
      if (failure) {
        setError(failure)
        return
      }
      closeForm(true)
      router.refresh()
    } catch {
      setError(formMessages.unavailable)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleStatus(item: FormDto, status: FormStatus) {
    if (!canMutate || busyId) return
    setError(null)
    setBusyId(item.id)
    try {
      const failure = await onSetStatus(item.id, status)
      if (failure) {
        setError(failure)
        return
      }
      router.refresh()
    } catch {
      setError(formMessages.unavailable)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operação"
        title="Formulários digitais"
        description="Crie modelos de cadastro, anamnese e consentimento para os fluxos da clínica."
        actions={
          <Button onClick={openCreate} disabled={!canMutate}>
            <Plus aria-hidden className="size-4" />
            Novo formulário
          </Button>
        }
      />

      <div className="flex items-start gap-2.5 rounded-card border border-status-pending/25 bg-status-pending-surface px-4 py-3 text-aux text-status-pending">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>
          {schemaPending
            ? 'A migration de formulários ainda não foi aplicada. A tela está pronta, mas a gravação fica bloqueada até o banco ser atualizado.'
            : isLive
              ? 'Os modelos são persistidos por clínica e controlados pela permissão de configurações. As respostas serão a próxima fatia.'
              : 'Modo demonstração: nenhum formulário fictício foi carregado e as gravações estão desabilitadas.'}
        </p>
      </div>

      {error ? (
        <div role="alert" className="rounded-card border border-status-negative/25 bg-status-negative-surface px-4 py-3 text-aux text-status-negative">
          {error}
        </div>
      ) : null}

      {forms.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title="Nenhum formulário criado"
            description="Comece com um modelo simples para cadastro, anamnese ou consentimento."
            action={
              <Button onClick={openCreate} disabled={!canMutate}>
                <Plus aria-hidden className="size-4" />
                Criar formulário
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 nav:grid-cols-2 xl:grid-cols-3">
          {forms.map((item) => {
            const status = statusMeta[item.status]
            return (
              <Card key={item.id} className="flex min-h-[238px] flex-col">
                <CardHeader
                  title={item.name}
                  description={`${typeLabel.get(item.type) ?? 'Formulário'} · v${item.version}`}
                  action={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
                />
                <div className="flex flex-1 flex-col px-5 pb-5">
                  <p className="line-clamp-2 min-h-10 text-aux text-muted">
                    {item.description || 'Sem descrição definida.'}
                  </p>
                  <div className="mt-4 flex items-center gap-2 text-label text-muted">
                    <span className="rounded-full bg-brand-subtle px-2.5 py-1 font-semibold text-link">
                      {item.fields.length} {item.fields.length === 1 ? 'campo' : 'campos'}
                    </span>
                    <span>Atualizado {formatDate(item.updatedAt)}</span>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                    <Button variant="secondary" onClick={() => openEdit(item)} disabled={!canMutate}>
                      <Pencil aria-hidden className="size-4" />
                      Editar
                    </Button>
                    {item.status === 'draft' ? (
                      <Button
                        variant="ghost"
                        onClick={() => void handleStatus(item, 'published')}
                        disabled={!canMutate || busyId === item.id}
                      >
                        <Check aria-hidden className="size-4" />
                        Publicar
                      </Button>
                    ) : item.status === 'published' ? (
                      <Button
                        variant="ghost"
                        onClick={() => void handleStatus(item, 'archived')}
                        disabled={!canMutate || busyId === item.id}
                      >
                        <ArchiveRestore aria-hidden className="size-4" />
                        Arquivar
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        onClick={() => void handleStatus(item, 'draft')}
                        disabled={!canMutate || busyId === item.id}
                      >
                        <ArchiveRestore aria-hidden className="size-4" />
                        Restaurar
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open) closeForm()
          else setModalOpen(true)
        }}
        title={editing ? 'Editar formulário' : 'Novo formulário'}
        description="Defina a estrutura que será usada pela clínica."
        className="sm:w-[min(760px,calc(100vw-2rem))]"
        footer={
          <>
            <Button variant="secondary" onClick={() => closeForm()} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" form="form-builder" isLoading={isSubmitting}>
              Salvar formulário
            </Button>
          </>
        }
      >
        <form id="form-builder" className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_240px]">
            <TextField
              label="Nome"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ex.: Pré-atendimento"
              maxLength={120}
              required
            />
            <SelectField
              label="Tipo"
              options={typeOptions}
              value={form.type}
              onChange={(event) =>
                setForm((current) => ({ ...current, type: event.target.value as FormType }))
              }
            />
          </div>

          <TextareaField
            label="Descrição"
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="Explique quando este formulário deve ser usado."
            maxLength={500}
          />

          <div className="rounded-card border border-border-card bg-background/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-control font-semibold text-foreground">Campos</h2>
                <p className="mt-1 text-label text-muted">A ordem será mantida quando o formulário for publicado.</p>
              </div>
              <Button type="button" variant="secondary" onClick={addField} disabled={form.fields.length >= 50}>
                <Plus aria-hidden className="size-4" />
                Adicionar campo
              </Button>
            </div>

            {form.fields.length === 0 ? (
              <div className="mt-4 rounded-field border border-dashed border-border-default px-4 py-8 text-center text-aux text-muted">
                Adicione o primeiro campo para começar o modelo.
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                {form.fields.map((field, index) => (
                  <FieldEditor
                    key={field.id}
                    field={field}
                    index={index}
                    total={form.fields.length}
                    onChange={(patch) => updateField(field.id, patch)}
                    onRemove={() => removeField(field.id)}
                    onMove={(direction) => moveField(field.id, direction)}
                  />
                ))}
              </div>
            )}
          </div>
        </form>
      </Modal>
    </div>
  )
}

function FieldEditor({
  field,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  field: FormFieldDto
  index: number
  total: number
  onChange: (patch: Partial<FormFieldDto>) => void
  onRemove: () => void
  onMove: (direction: -1 | 1) => void
}) {
  const supportsOptions = ['select', 'checkbox', 'radio'].includes(field.type)

  return (
    <div className="rounded-field border border-border-card bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="mt-2 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-label font-semibold text-link">
          {index + 1}
        </span>
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
          <TextField
            label="Rótulo do campo"
            value={field.label}
            onChange={(event) => onChange({ label: event.target.value })}
            placeholder="Ex.: Como você está se sentindo?"
            maxLength={160}
            required
          />
          <SelectField
            label="Tipo de resposta"
            options={fieldTypeOptions}
            value={field.type}
            onChange={(event) => onChange({ type: event.target.value as FormFieldType })}
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover campo ${index + 1}`}
          className="mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-field text-muted transition-colors hover:bg-status-negative-surface hover:text-status-negative"
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <TextField
          label="Ajuda (opcional)"
          value={field.helpText ?? ''}
          onChange={(event) => onChange({ helpText: event.target.value || null })}
          placeholder="Orientação para quem vai responder"
          maxLength={240}
        />
        <label className="flex h-11 items-center gap-2 px-1 text-label font-semibold text-foreground">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(event) => onChange({ required: event.target.checked })}
            className="size-4 accent-brand"
          />
          Obrigatório
        </label>
      </div>

      {supportsOptions ? (
        <TextField
          label="Opções"
          hint="Separe as opções por vírgula."
          value={field.options.join(', ')}
          onChange={(event) =>
            onChange({
              options: event.target.value
                .split(',')
                .map((option) => option.trim())
                .filter(Boolean),
            })
          }
          className="mt-3"
          placeholder="Ex.: Sim, Não, Talvez"
        />
      ) : null}

      <div className="mt-3 flex items-center justify-end gap-1 border-t border-border-card pt-3">
        <span className="mr-auto text-label text-muted">Campo {index + 1} de {total}</span>
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label="Mover campo para cima"
          className={moveButtonClass}
        >
          <ArrowUp aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          aria-label="Mover campo para baixo"
          className={moveButtonClass}
        >
          <ArrowDown aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  )
}

const moveButtonClass =
  'inline-flex size-9 items-center justify-center rounded-field text-muted transition-colors hover:bg-row-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40'

function createFieldId(): string {
  return `field-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(value))
}
