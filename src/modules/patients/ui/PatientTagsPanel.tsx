'use client'

import { Plus, Tag, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { SelectField } from '@/components/ui/select-field'
import { TextField } from '@/components/ui/text-field'

import {
  addPatientTagFromScreen,
  removePatientTagFromScreen,
} from '../actions/patientTagScreen.actions'
import type { PatientTagColor } from '../domain/PatientTag'
import {
  type PatientTagDto,
  patientTagMessages,
} from '../schemas/patientTag.schema'

export interface PatientTagsPanelProps {
  patientId: string
  tags: readonly PatientTagDto[]
  isLive: boolean
  canManage: boolean
  schemaPending?: boolean
  onAdd?: (name: string, color: PatientTagColor) => Promise<string | null>
  onRemove?: (tagId: string) => Promise<string | null>
}

const colorOptions = [
  { value: 'blue', label: 'Azul' },
  { value: 'violet', label: 'Violeta' },
  { value: 'green', label: 'Verde' },
  { value: 'amber', label: 'Âmbar' },
  { value: 'rose', label: 'Rosa' },
  { value: 'slate', label: 'Cinza' },
] as const

const colorClasses: Record<PatientTagColor, string> = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
}

export function PatientTagsPanel({
  patientId,
  tags,
  isLive,
  canManage,
  schemaPending = false,
  onAdd,
  onRemove,
}: PatientTagsPanelProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [color, setColor] = useState<PatientTagColor>('blue')
  const [error, setError] = useState<string | null>(null)
  const [isAdding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const enabled = isLive && canManage && !schemaPending
  const disabledReason = !isLive
    ? 'Indisponível no modo demonstração: não há banco configurado.'
    : schemaPending
      ? patientTagMessages.schemaPending
      : !canManage
        ? 'Seu papel não permite alterar tags deste paciente.'
        : undefined

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError(patientTagMessages.nameRequired)
      return
    }

    setError(null)
    setAdding(true)
    try {
      const failure = await (onAdd
        ? onAdd(trimmed, color)
        : addPatientTagFromScreen(patientId, trimmed, color))
      if (failure) {
        setError(failure)
        return
      }
      setName('')
      router.refresh()
    } catch {
      setError(patientTagMessages.unavailable)
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(tag: PatientTagDto) {
    if (!enabled || removingId) return
    setError(null)
    setRemovingId(tag.id)
    try {
      const failure = await (onRemove
        ? onRemove(tag.id)
        : removePatientTagFromScreen(patientId, tag.id))
      if (failure) {
        setError(failure)
        return
      }
      router.refresh()
    } catch {
      setError(patientTagMessages.unavailable)
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Tags do paciente"
        description="Organize segmentações administrativas para buscar e acompanhar a operação."
      />
      <div className="px-5 pb-5">
        {!isLive || schemaPending ? (
          <p
            role="status"
            className="mb-4 rounded-field border border-border-default bg-background px-4 py-3 text-label text-muted"
          >
            {schemaPending
              ? patientTagMessages.schemaPending
              : 'Modo demonstração: nenhuma tag pessoal fictícia é exibida.'}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mb-4 rounded-field bg-status-negative-surface px-4 py-3 text-label text-status-negative">
            {error}
          </p>
        ) : null}

        {tags.length === 0 ? (
          <EmptyState
            icon={Tag}
            title="Nenhuma tag vinculada"
            description="Adicione marcadores administrativos como retorno, convênio ou prioridade."
            className="px-0 py-6"
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-label font-semibold ring-1 ${colorClasses[tag.color]}`}
              >
                {tag.name}
                <button
                  type="button"
                  aria-label={`Remover tag ${tag.name}`}
                  title={disabledReason}
                  disabled={!enabled || removingId === tag.id}
                  onClick={() => void handleRemove(tag)}
                  className="inline-flex size-5 items-center justify-center rounded-full transition-colors hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X aria-hidden className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <form className="mt-5 grid gap-3 border-t border-border-card pt-5 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-end" onSubmit={handleAdd}>
          <TextField
            label="Nova tag"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Retorno"
            maxLength={40}
            disabled={!enabled}
            title={disabledReason}
          />
          <SelectField
            label="Cor"
            options={colorOptions}
            value={color}
            onChange={(event) => setColor(event.target.value as PatientTagColor)}
            disabled={!enabled}
            title={disabledReason}
          />
          <Button type="submit" isLoading={isAdding} disabled={!enabled} title={disabledReason}>
            <Plus aria-hidden className="size-4" />
            Adicionar
          </Button>
        </form>
      </div>
    </Card>
  )
}
