'use client'

import { Info, Pencil, Plus, ShieldAlert, Undo2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { StatusBadge } from '@/components/ui/status-badge'
import { TextareaField } from '@/components/ui/textarea-field'
import { TextField } from '@/components/ui/text-field'

import { activeAllergies, sortForChart } from '../domain/Allergy'
import { allergyMessages, type AllergyDto } from '../schemas/allergy.schema'
import type { PatientAllergiesPanelProps } from './PatientAllergiesPanel.props'

/**
 * Alergias na ficha — o dado que se confere antes de prescrever.
 *
 * # A gravidade não aparece, e a tela diz por quê
 *
 * `allergies.severity` guarda um número e a escala não pôde ser verificada
 * neste ambiente. Mostrar "2" sem saber se a escala vai até 3 ou até 5, nem
 * para que lado cresce, é pior do que não mostrar: quem lê assume a escala que
 * conhece. A descrição da reação, em texto, é o que sustenta a decisão.
 *
 * # Não existe excluir
 *
 * Uma alergia registrada por engano continua sendo história clínica. "Descartar"
 * a tira da lista de atenção e a mantém no histórico, visível e reversível.
 */
export function PatientAllergiesPanel({
  patientId,
  allergies,
  onSubmit,
  onSetActive,
  canManage,
  isLive,
  loadError = null,
}: PatientAllergiesPanelProps) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<AllergyDto | null>(null)
  const [substance, setSubstance] = useState('')
  const [reaction, setReaction] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const editable = canManage && isLive && !loadError
  const ordered = sortForChart(allergies)
  const activeCount = activeAllergies(ordered).length

  function openCreate() {
    setEditing(null)
    setSubstance('')
    setReaction('')
    setError(null)
    setModalOpen(true)
  }

  function openEdit(allergy: AllergyDto) {
    setEditing(allergy)
    setSubstance(allergy.substance)
    setReaction(allergy.reaction ?? '')
    setError(null)
    setModalOpen(true)
  }

  function close(force = false) {
    if (saving && !force) return
    setModalOpen(false)
    setEditing(null)
    setSubstance('')
    setReaction('')
    setError(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (substance.trim().length < 2) {
      setError(allergyMessages.substanceRequired)
      return
    }

    setSaving(true)
    try {
      const failure = await onSubmit(
        patientId,
        { substance: substance.trim(), reaction },
        editing?.id ?? null,
      )
      if (failure) {
        setError(failure)
        return
      }
      close(true)
      router.refresh()
    } catch {
      setError(allergyMessages.unavailable)
    } finally {
      setSaving(false)
    }
  }

  async function toggle(allergy: AllergyDto) {
    setBusyId(allergy.id)
    setError(null)
    try {
      const failure = await onSetActive(allergy.id, !allergy.isActive)
      if (failure) setError(failure)
      else router.refresh()
    } catch {
      setError(allergyMessages.unavailable)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Alergias"
        description={
          isLive
            ? `${activeCount === 0 ? 'Nenhuma ativa' : activeCount === 1 ? '1 ativa' : `${activeCount} ativas`}. Conferir antes de prescrever; registros descartados ficam no histórico.`
            : 'Modo demonstração: nenhuma alergia fictícia é exibida.'
        }
        action={
          <Button onClick={openCreate} disabled={!editable}>
            <Plus aria-hidden className="size-4" />
            Registrar alergia
          </Button>
        }
        className="border-b border-border-card"
      />

      {loadError ? (
        <div
          role="alert"
          className="m-4 rounded-card border border-status-negative/25 bg-status-negative-surface px-4 py-3 text-aux text-status-negative"
        >
          {loadError}
        </div>
      ) : null}

      {error && !modalOpen ? (
        <div
          role="alert"
          className="m-4 rounded-card border border-status-negative/25 bg-status-negative-surface px-4 py-3 text-aux text-status-negative"
        >
          {error}
        </div>
      ) : null}

      {ordered.length === 0 && !loadError ? (
        <div className="flex items-start gap-2.5 px-5 py-5 text-aux text-muted">
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {/*
            "Nenhuma alergia registrada" e não "sem alergias".
            A ficha vazia significa que ninguém perguntou ainda, e não que o
            paciente não tem — a diferença importa na hora de prescrever.
          */}
          <p>Nenhuma alergia registrada até agora. Isso não significa ausência de alergia.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border-card">
          {ordered.map((allergy) => (
            <li key={allergy.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-aux font-semibold text-foreground">
                    {allergy.substance}
                  </p>
                  <StatusBadge tone={allergy.isActive ? 'negative' : 'neutral'}>
                    {allergy.isActive ? 'Ativa' : 'Descartada'}
                  </StatusBadge>
                </div>
                <p className="mt-0.5 text-label text-muted">
                  {allergy.reaction || 'Reação não descrita'}
                </p>
              </div>

              {editable ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => openEdit(allergy)}
                    disabled={busyId === allergy.id}
                  >
                    <Pencil aria-hidden className="size-4" />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void toggle(allergy)}
                    disabled={busyId === allergy.id}
                  >
                    <Undo2 aria-hidden className="size-4" />
                    {allergy.isActive ? 'Descartar' : 'Reativar'}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-start gap-2.5 border-t border-border-card px-5 py-3.5 text-label text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {allergyMessages.severityUnavailable}
      </p>

      <Modal
        open={modalOpen}
        onOpenChange={(open) => (open ? setModalOpen(true) : close())}
        title={editing ? 'Editar alergia' : 'Registrar alergia'}
        description="A gravidade não é registrada: descreva a reação em texto."
        footer={
          <>
            <Button variant="secondary" onClick={() => close()} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" form="allergy-form" isLoading={saving}>
              Salvar
            </Button>
          </>
        }
      >
        <form id="allergy-form" className="flex flex-col gap-4" onSubmit={submit} noValidate>
          {error ? (
            <div
              role="alert"
              className="rounded-field border border-status-negative/25 bg-status-negative-surface px-3 py-2 text-label text-status-negative"
            >
              {error}
            </div>
          ) : null}

          <TextField
            label="Substância"
            value={substance}
            onChange={(event) => setSubstance(event.target.value)}
            placeholder="Ex.: dipirona, látex, penicilina"
            required
          />
          <TextareaField
            label="Reação"
            value={reaction}
            onChange={(event) => setReaction(event.target.value)}
            placeholder="Descreva o que aconteceu: urticária, edema, dificuldade respiratória."
            hint="Texto livre — é o que se lê antes de prescrever."
          />
        </form>
      </Modal>
    </Card>
  )
}
