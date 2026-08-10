'use client'

import { Activity, Info, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { TextareaField } from '@/components/ui/textarea-field'
import { TextField } from '@/components/ui/text-field'

import { bmiFrom, sortByMeasuredAt } from '../domain/Vitals'
import {
  vitalsMessages,
  type VitalsEntryDto,
  type VitalsFormValues,
} from '../schemas/vitals.schema'
import type { PatientVitalsPanelProps } from './PatientVitalsPanel.props'

function emptyForm(): VitalsFormValues {
  return {
    measuredAt: '',
    weightKg: '',
    heightCm: '',
    systolicBp: '',
    diastolicBp: '',
    heartRate: '',
    respiratoryRate: '',
    temperatureC: '',
    spo2: '',
    glucoseMgdl: '',
    notes: '',
  }
}

/**
 * Sinais vitais na ficha — o histórico das aferições.
 *
 * # Nenhum valor é pintado de normal ou alterado
 *
 * Faixa de referência depende de idade, condição e diretriz: a pressão "alta"
 * de um adulto é outra na criança, e a saturação aceitável de um paciente com
 * DPOC não é a da população geral. Um número vermelho aqui pareceria um
 * julgamento clínico do produto — e seria um julgamento que este código não tem
 * como fazer. A tela mostra o valor com a unidade; a leitura é de quem atende.
 *
 * # Não existe editar nem excluir
 *
 * `vitals` não tem `updated_at` nem `deleted_at`. A medida é de um instante:
 * corrigir é registrar de novo, e a aferição anterior permanece como prova do
 * que se mediu naquela hora.
 */
export function PatientVitalsPanel({
  patientId,
  entries,
  onRecord,
  canRecord,
  isLive,
  loadError = null,
}: PatientVitalsPanelProps) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<VitalsFormValues>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const editable = canRecord && isLive && !loadError
  const ordered = sortByMeasuredAt(entries)

  function open() {
    /*
     * A data nasce com o AGORA local, e é editável.
     *
     * Quem afere costuma registrar na hora; quem transcreve uma anotação de
     * papel precisa poder recuar. Deixar o campo vazio faria a maioria digitar
     * data e hora à mão em toda aferição.
     */
    const now = new Date()
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    setForm({ ...emptyForm(), measuredAt: local.toISOString().slice(0, 16) })
    setError(null)
    setModalOpen(true)
  }

  function close(force = false) {
    if (saving && !force) return
    setModalOpen(false)
    setForm(emptyForm())
    setError(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!form.measuredAt) {
      setError(vitalsMessages.dateInvalid)
      return
    }

    setSaving(true)
    try {
      const failure = await onRecord(patientId, form)
      if (failure) {
        setError(failure)
        return
      }
      close(true)
      router.refresh()
    } catch {
      setError(vitalsMessages.unavailable)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Sinais vitais"
        description={
          isLive
            ? 'Cada aferição é um registro novo — não há edição, e a anterior permanece.'
            : 'Modo demonstração: nenhuma aferição fictícia é exibida.'
        }
        action={
          <Button onClick={open} disabled={!editable}>
            <Plus aria-hidden className="size-4" />
            Registrar aferição
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
          <Activity aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>Nenhuma aferição registrada até agora.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border-card">
          {ordered.map((entry) => (
            <li key={entry.id} className="px-5 py-3.5">
              <p className="text-label font-semibold text-foreground">
                {formatMoment(entry.measuredAt)}
              </p>
              <p className="mt-1 text-aux text-foreground">{describeMeasurements(entry)}</p>
              {entry.notes ? (
                <p className="mt-0.5 text-label text-muted">{entry.notes}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-start gap-2.5 border-t border-border-card px-5 py-3.5 text-label text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        Os valores aparecem como foram medidos, sem classificação. Faixa de referência
        depende de idade, condição e diretriz — a leitura é de quem atende.
      </p>

      <Modal
        open={modalOpen}
        onOpenChange={(open) => (open ? setModalOpen(true) : close())}
        title="Registrar aferição"
        description="Preencha o que foi medido. Campos em branco não são gravados."
        footer={
          <>
            <Button variant="secondary" onClick={() => close()} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" form="vitals-form" isLoading={saving}>
              Salvar aferição
            </Button>
          </>
        }
      >
        <form id="vitals-form" className="flex flex-col gap-4" onSubmit={submit} noValidate>
          {error ? (
            <div
              role="alert"
              className="rounded-field border border-status-negative/25 bg-status-negative-surface px-3 py-2 text-label text-status-negative"
            >
              {error}
            </div>
          ) : null}

          <TextField
            label="Data e hora da aferição"
            type="datetime-local"
            value={form.measuredAt}
            onChange={(event) =>
              setForm((current) => ({ ...current, measuredAt: event.target.value }))
            }
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Pressão sistólica (mmHg)"
              type="number"
              value={form.systolicBp}
              onChange={(event) =>
                setForm((current) => ({ ...current, systolicBp: event.target.value }))
              }
            />
            <TextField
              label="Pressão diastólica (mmHg)"
              type="number"
              value={form.diastolicBp}
              onChange={(event) =>
                setForm((current) => ({ ...current, diastolicBp: event.target.value }))
              }
              hint="As duas juntas, ou nenhuma."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="Frequência cardíaca (bpm)"
              type="number"
              value={form.heartRate}
              onChange={(event) =>
                setForm((current) => ({ ...current, heartRate: event.target.value }))
              }
            />
            <TextField
              label="Frequência respiratória (irpm)"
              type="number"
              value={form.respiratoryRate}
              onChange={(event) =>
                setForm((current) => ({ ...current, respiratoryRate: event.target.value }))
              }
            />
            <TextField
              label="Saturação (%)"
              type="number"
              value={form.spo2}
              onChange={(event) => setForm((current) => ({ ...current, spo2: event.target.value }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Temperatura (°C)"
              type="number"
              step="0.1"
              value={form.temperatureC}
              onChange={(event) =>
                setForm((current) => ({ ...current, temperatureC: event.target.value }))
              }
            />
            <TextField
              label="Glicemia (mg/dL)"
              type="number"
              value={form.glucoseMgdl}
              onChange={(event) =>
                setForm((current) => ({ ...current, glucoseMgdl: event.target.value }))
              }
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Peso (kg)"
              type="number"
              step="0.1"
              value={form.weightKg}
              onChange={(event) =>
                setForm((current) => ({ ...current, weightKg: event.target.value }))
              }
            />
            <TextField
              label="Altura (cm)"
              type="number"
              step="0.1"
              value={form.heightCm}
              onChange={(event) =>
                setForm((current) => ({ ...current, heightCm: event.target.value }))
              }
            />
          </div>

          <TextareaField
            label="Observações (opcional)"
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Condições da medida: em repouso, após esforço, braço esquerdo."
          />
        </form>
      </Modal>
    </Card>
  )
}

/**
 * A linha do histórico: só o que foi medido, com a unidade.
 *
 * Campo em branco não vira "—" nem zero: ele simplesmente não aparece. Um zero
 * onde ninguém mediu seria uma medida inventada, e um travessão para cada um
 * dos nove campos afogaria os dois que foram preenchidos.
 */
function describeMeasurements(entry: VitalsEntryDto): string {
  const parts: string[] = []

  if (entry.systolicBp !== null && entry.diastolicBp !== null) {
    parts.push(`PA ${entry.systolicBp}/${entry.diastolicBp} mmHg`)
  }
  if (entry.heartRate !== null) parts.push(`FC ${entry.heartRate} bpm`)
  if (entry.respiratoryRate !== null) parts.push(`FR ${entry.respiratoryRate} irpm`)
  if (entry.temperatureC !== null) parts.push(`Temp ${formatDecimal(entry.temperatureC)} °C`)
  if (entry.spo2 !== null) parts.push(`SpO₂ ${entry.spo2}%`)
  if (entry.glucoseMgdl !== null) parts.push(`Glicemia ${entry.glucoseMgdl} mg/dL`)
  if (entry.weightKg !== null) parts.push(`Peso ${formatDecimal(entry.weightKg)} kg`)
  if (entry.heightCm !== null) parts.push(`Altura ${formatDecimal(entry.heightCm)} cm`)

  const bmi = bmiFrom(entry.weightKg, entry.heightCm)
  // O IMC aparece como número, sem faixa: "sobrepeso" não vale para criança,
  // atleta nem gestante, e a classificação ao lado do valor pareceria medida.
  if (bmi !== null) parts.push(`IMC ${formatDecimal(bmi)}`)

  return parts.join(' · ')
}

function formatDecimal(value: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)
}

function formatMoment(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
