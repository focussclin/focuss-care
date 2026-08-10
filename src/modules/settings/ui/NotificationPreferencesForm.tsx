'use client'

import { Bell, Save } from 'lucide-react'
import { useState, useTransition, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'

import { updateNotificationPreferencesAction } from '../actions/updateNotificationPreferences.action'
import { settingsMessages } from '../schemas/settings.schema'

export interface NotificationPreferencesFormProps {
  operational: boolean
  canManage: boolean
  isLive: boolean
}

/** Preferência única com efeito real no centro de avisos da clínica. */
export function NotificationPreferencesForm({
  operational,
  canManage,
  isLive,
}: NotificationPreferencesFormProps) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(operational)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSaved(false)

    startTransition(async () => {
      try {
        const result = await updateNotificationPreferencesAction({
          operational: enabled,
        })

        if (!result.ok) {
          setError(result.error.message)
          return
        }

        setEnabled(result.data.operational)
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
        title="Avisos operacionais"
        description="Escolha se a clínica cria avisos no centro de notificações."
      />

      <form onSubmit={handleSubmit} className="space-y-4 px-5 pb-5">
        <div className="flex items-start gap-3 rounded-card border border-border-card bg-background px-4 py-2">
          <Bell aria-hidden className="mt-3 size-4 shrink-0 text-brand" />
          <Checkbox
            label="Receber avisos de agenda, recepção e financeiro"
            checked={enabled}
            disabled={!editable || isPending}
            onCheckedChange={(checked) => {
              setEnabled(checked)
              setSaved(false)
            }}
          />
        </div>

        <p className="text-label text-muted">
          O ajuste vale para novos avisos. O histórico já criado continua
          disponível para consulta.
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
              {saved ? 'Preferência salva.' : ''}
            </p>

            <Button type="submit" disabled={isPending}>
              <Save aria-hidden className="size-4" />
              {isPending ? 'Salvando…' : 'Salvar avisos'}
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  )
}
