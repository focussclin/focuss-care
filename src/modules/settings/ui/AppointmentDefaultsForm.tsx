'use client'

import { Save } from 'lucide-react'
import { useState, useTransition, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { SelectField } from '@/components/ui/select-field'

import { updateAppointmentDefaultsAction } from '../actions/updateAppointmentDefaults.action'
import { durationChoices, settingsMessages } from '../schemas/settings.schema'

export interface AppointmentDefaultsFormProps {
  durationMinutes: number
  canManage: boolean
  isLive: boolean
}

/**
 * Padrões da agenda.
 *
 * A única preferência desta tela **sem ressalva**: a duração escolhida aqui é a
 * que o formulário de novo agendamento abre selecionada, hoje, na rota
 * `/agenda`. Por isso o texto de apoio pode afirmar o efeito sem qualificar.
 */
export function AppointmentDefaultsForm({
  durationMinutes,
  canManage,
  isLive,
}: AppointmentDefaultsFormProps) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duration, setDuration] = useState(String(durationMinutes))

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSaved(false)

    startTransition(async () => {
      try {
        const result = await updateAppointmentDefaultsAction({
          durationMinutes: duration,
        })

        if (!result.ok) {
          setError(result.error.message)
          return
        }

        setDuration(String(result.data.durationMinutes))
        setSaved(true)
      } catch {
        setError(settingsMessages.unavailable)
      }
    })
  }

  const editable = canManage && isLive

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Padrões da agenda"
        description="O que o formulário de agendamento assume quando ninguém escolhe."
      />

      <form onSubmit={handleSubmit} className="space-y-5 px-5 pb-5">
        <div className="max-w-xs">
          <SelectField
            label="Duração padrão do atendimento"
            value={duration}
            disabled={!editable || isPending}
            onChange={(event) => {
              setSaved(false)
              setDuration(event.target.value)
            }}
            options={durationChoices.map((choice) => ({
              value: String(choice.value),
              label: choice.label,
            }))}
          />
        </div>

        <p className="text-label text-muted">
          Vale como sugestão: cada agendamento continua podendo ter a duração
          alterada na hora de marcar.
        </p>

        {error ? (
          <p
            role="alert"
            className="rounded-card border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
          >
            {error}
          </p>
        ) : null}

        {editable ? (
          <div className="flex items-center justify-between gap-3 border-t border-border-card pt-5">
            <p role="status" className="text-label text-muted">
              {saved ? 'Padrão salvo.' : ''}
            </p>

            <Button type="submit" disabled={isPending}>
              <Save aria-hidden className="size-4" />
              {isPending ? 'Salvando…' : 'Salvar padrão'}
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  )
}
