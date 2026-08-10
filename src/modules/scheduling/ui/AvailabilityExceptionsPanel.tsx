'use client'

import { CalendarOff, CalendarPlus, Info, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { StatusBadge } from '@/components/ui/status-badge'
import { TextareaField } from '@/components/ui/textarea-field'
import { TextField } from '@/components/ui/text-field'
import type { AvailabilityKind } from '@/lib/supabase/database.types'

import { sortByStart } from '../domain/AvailabilityException'
import {
  availabilityMessages,
  type AvailabilityExceptionDto,
  type AvailabilityExceptionFormValues,
} from '../schemas/availabilityException.schema'
import type { AvailabilityExceptionsPanelProps } from './AvailabilityExceptionsPanel.props'

const emptyForm: AvailabilityExceptionFormValues = {
  professionalId: '',
  kind: 'block',
  startsAt: '',
  endsAt: '',
  reason: '',
}

/**
 * Bloqueios e horários extras da agenda.
 *
 * Mora em `/configuracoes` porque é a exceção ao horário de funcionamento, que
 * é configurado logo acima. `block` fecha uma janela (feriado, férias,
 * manutenção); `extra` abre uma fora do expediente (mutirão, plantão).
 *
 * **Isto não é `time_off` da equipe.** Aquilo é registro de RH sobre
 * funcionários; isto é sobre a agenda de profissionais. Uma recepcionista de
 * férias não bloqueia horário nenhum.
 */
export function AvailabilityExceptionsPanel({
  exceptions,
  professionals,
  onCreate,
  onRemove,
  canManage,
  isLive,
  loadError = null,
}: AvailabilityExceptionsPanelProps) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const editable = canManage && isLive && !loadError
  const ordered = sortByStart(exceptions)

  function open() {
    setForm(emptyForm)
    setError(null)
    setModalOpen(true)
  }

  function close(force = false) {
    if (saving && !force) return
    setModalOpen(false)
    setForm(emptyForm)
    setError(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!form.startsAt || !form.endsAt) {
      setError(availabilityMessages.dateInvalid)
      return
    }
    if (new Date(form.endsAt).getTime() <= new Date(form.startsAt).getTime()) {
      setError(availabilityMessages.windowInverted)
      return
    }

    setSaving(true)
    try {
      const failure = await onCreate(form)
      if (failure) {
        setError(failure)
        return
      }
      close(true)
      router.refresh()
    } catch {
      setError(availabilityMessages.unavailable)
    } finally {
      setSaving(false)
    }
  }

  async function remove(exception: AvailabilityExceptionDto) {
    setBusyId(exception.id)
    setError(null)
    try {
      const failure = await onRemove(exception.id)
      if (failure) setError(failure)
      else router.refresh()
    } catch {
      setError(availabilityMessages.unavailable)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Bloqueios e horários extras"
        description={
          isLive
            ? 'Feriado, férias e manutenção fecham a agenda; mutirão e plantão abrem horário fora do expediente.'
            : 'Modo demonstração: nenhum bloqueio fictício é exibido.'
        }
        action={
          <Button onClick={open} disabled={!editable}>
            <Plus aria-hidden className="size-4" />
            Nova exceção
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
        <p className="px-5 py-5 text-aux text-muted">
          Nenhum bloqueio ou horário extra cadastrado. A agenda segue o horário de
          funcionamento acima.
        </p>
      ) : (
        <ul className="divide-y divide-border-card">
          {ordered.map((exception) => (
            <li key={exception.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
              <span
                className={
                  exception.kind === 'block'
                    ? 'flex size-9 shrink-0 items-center justify-center rounded-field bg-status-negative-surface text-status-negative'
                    : 'flex size-9 shrink-0 items-center justify-center rounded-field bg-status-positive-surface text-status-positive'
                }
              >
                {exception.kind === 'block' ? (
                  <CalendarOff aria-hidden className="size-4" />
                ) : (
                  <CalendarPlus aria-hidden className="size-4" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-aux font-semibold text-foreground">
                    {/*
                      Sem profissional é a CLÍNICA inteira — a coluna é nullable
                      no banco exatamente para isso, e a diferença muda quem
                      fica sem agenda.
                    */}
                    {exception.professionalName ?? 'Toda a clínica'}
                  </p>
                  <StatusBadge tone={exception.kind === 'block' ? 'negative' : 'positive'}>
                    {exception.kind === 'block' ? 'Bloqueio' : 'Horário extra'}
                  </StatusBadge>
                </div>
                <p className="mt-0.5 text-label text-muted">
                  {formatWindow(exception.startsAt, exception.endsAt)}
                  {exception.reason ? ` · ${exception.reason}` : ''}
                </p>
              </div>

              {editable ? (
                <Button
                  variant="ghost"
                  onClick={() => void remove(exception)}
                  disabled={busyId === exception.id}
                >
                  <Trash2 aria-hidden className="size-4" />
                  Remover
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-start gap-2.5 border-t border-border-card px-5 py-3.5 text-label text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        Bloqueio recusa agendamento na janela, sem oferecer confirmação — ao contrário
        de &quot;fora do expediente&quot;, que pergunta. Horário extra dispensa essa pergunta
        quando cobre o atendimento inteiro.
      </p>

      <Modal
        open={modalOpen}
        onOpenChange={(open) => (open ? setModalOpen(true) : close())}
        title="Nova exceção"
        description="Bloquear fecha a janela; horário extra a abre fora do expediente."
        footer={
          <>
            <Button variant="secondary" onClick={() => close()} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" form="availability-form" isLoading={saving}>
              Salvar
            </Button>
          </>
        }
      >
        <form id="availability-form" className="flex flex-col gap-4" onSubmit={submit} noValidate>
          {error ? (
            <div
              role="alert"
              className="rounded-field border border-status-negative/25 bg-status-negative-surface px-3 py-2 text-label text-status-negative"
            >
              {error}
            </div>
          ) : null}

          <SelectField
            label="Tipo"
            value={form.kind}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                kind: event.target.value as AvailabilityKind,
              }))
            }
            options={[
              { value: 'block', label: 'Bloquear a agenda' },
              { value: 'extra', label: 'Abrir horário extra' },
            ]}
          />

          <SelectField
            label="Quem"
            value={form.professionalId}
            onChange={(event) =>
              setForm((current) => ({ ...current, professionalId: event.target.value }))
            }
            options={[
              { value: '', label: 'Toda a clínica' },
              ...professionals.map((professional) => ({
                value: professional.id,
                label: professional.name,
              })),
            ]}
            hint="Feriado fecha a clínica inteira; férias fecham a agenda de uma pessoa."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Início"
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, startsAt: event.target.value }))
              }
              required
            />
            <TextField
              label="Fim"
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) =>
                setForm((current) => ({ ...current, endsAt: event.target.value }))
              }
              required
            />
          </div>

          <TextareaField
            label="Motivo (opcional)"
            value={form.reason}
            onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
            placeholder="Feriado municipal, férias, manutenção do equipamento."
            hint="Aparece para quem tentar marcar dentro da janela."
          />

          {form.kind === 'block' ? (
            <p className="text-label text-muted">
              Bloquear não move atendimento: se já houver alguém marcado na janela, o
              bloqueio é recusado para você remarcar antes.
            </p>
          ) : null}
        </form>
      </Modal>
    </Card>
  )
}

function formatWindow(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const date = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const sameDay = date.format(start) === date.format(end)
  return sameDay
    ? `${date.format(start)} · ${time.format(start)} às ${time.format(end)}`
    : `${date.format(start)} ${time.format(start)} → ${date.format(end)} ${time.format(end)}`
}
