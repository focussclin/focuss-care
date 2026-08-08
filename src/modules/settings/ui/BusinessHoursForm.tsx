'use client'

import { AlertTriangle, Info, Save } from 'lucide-react'
import { useState, useTransition, type FormEvent } from 'react'

import { Card, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'

import { updateBusinessHoursAction } from '../actions/updateBusinessHours.action'
import {
  settingsMessages,
  weekdayLabels,
  type BusinessDayDto,
  type ClinicSettingsDto,
} from '../schemas/settings.schema'

export interface BusinessHoursFormProps {
  days: readonly BusinessDayDto[]
  hoursSource: ClinicSettingsDto['hoursSource']
  canManage: boolean
  isLive: boolean
}

/**
 * Horário de funcionamento da clínica.
 *
 * # O que salvar aqui passa a fazer
 *
 * Desde **A-02**, a agenda usa este horário: um atendimento fora dele pede
 * confirmação antes de ser gravado, e a confirmação vai para a auditoria. Não é
 * bloqueio — encaixe às 19h acontece, e proibi-lo faria a recepção registrar
 * hora falsa para conseguir marcar.
 *
 * **Só o que foi salvo vale.** Os valores exibidos por uma clínica que nunca
 * configurou nada são sugestão de tela, e a agenda não os impõe: impor um
 * palpite recusaria o domingo de quem atende domingo e nunca disse o contrário.
 * Por isso o texto do formulário fala em "depois de salvo".
 */
export function BusinessHoursForm({
  days,
  hoursSource,
  canManage,
  isLive,
}: BusinessHoursFormProps) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<BusinessDayDto[]>(() => days.map((d) => d))

  function update(weekday: number, patch: Partial<BusinessDayDto>) {
    setSaved(false)
    setDraft((current) =>
      current.map((day) =>
        day.weekday === weekday ? { ...day, ...patch } : day,
      ),
    )
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSaved(false)

    startTransition(async () => {
      try {
        const result = await updateBusinessHoursAction({ days: draft })

        if (!result.ok) {
          // A mensagem de validação já nomeia o dia — ver o `superRefine` do
          // schema, que existe justamente porque `fieldErrors` só alcança
          // `days`, e não o dia que está errado.
          setError(result.error.fieldErrors?.days ?? result.error.message)
          return
        }

        setDraft(result.data.map((day) => day))
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
        title="Horário de funcionamento"
        description="Quando a clínica atende ao público."
      />

      {hoursSource === 'unrecognized' ? (
        <p
          role="alert"
          className="mx-5 mb-4 flex items-start gap-2.5 rounded-card border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
        >
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {settingsMessages.hoursUnrecognized}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="px-5 pb-5">
        <ul className="flex flex-col divide-y divide-border-card border-y border-border-card">
          {draft.map((day) => (
            <li
              key={day.weekday}
              className="flex flex-wrap items-center gap-4 py-3"
            >
              <span className="w-32 shrink-0 text-aux font-semibold text-foreground">
                {weekdayLabels[day.weekday]}
              </span>

              <Checkbox
                label="Fechado"
                checked={day.closed}
                disabled={!editable || isPending}
                onCheckedChange={(checked) =>
                  update(day.weekday, { closed: checked })
                }
              />

              {day.closed ? (
                <span className="text-aux text-muted">Sem atendimento</span>
              ) : (
                <div className="flex items-center gap-2">
                  {/*
                    `input type="time"` cru, e não o `TextField` do design system:
                    o campo do sistema traz rótulo visível, e catorze rótulos
                    "Abre"/"Fecha" empilhados competiriam com o nome do dia. O
                    `aria-label` mantém a leitura de tela completa.
                  */}
                  <TimeInput
                    label={`${weekdayLabels[day.weekday]} — horário de abertura`}
                    value={day.opensAt}
                    disabled={!editable || isPending}
                    onChange={(value) => update(day.weekday, { opensAt: value })}
                  />
                  <span aria-hidden className="text-muted">
                    às
                  </span>
                  <TimeInput
                    label={`${weekdayLabels[day.weekday]} — horário de fechamento`}
                    value={day.closesAt}
                    disabled={!editable || isPending}
                    onChange={(value) =>
                      update(day.weekday, { closesAt: value })
                    }
                  />
                </div>
              )}
            </li>
          ))}
        </ul>

        <p className="mt-4 flex items-start gap-2.5 text-label text-muted">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          Depois de salvo, a agenda <strong className="font-semibold">avisa</strong>{' '}
          quando um atendimento cai fora deste horário e pede confirmação — o
          encaixe continua possível, e fica registrado como exceção. Enquanto
          nada for salvo aqui, a agenda não questiona horário nenhum. Turnos
          partidos (com intervalo no meio do dia) ainda não são representados.
        </p>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-card border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
          >
            {error}
          </p>
        ) : null}

        {editable ? (
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border-card pt-5">
            <p role="status" className="text-label text-muted">
              {saved ? 'Horário salvo.' : ''}
            </p>

            <Button type="submit" disabled={isPending}>
              <Save aria-hidden className="size-4" />
              {isPending ? 'Salvando…' : 'Salvar horário'}
            </Button>
          </div>
        ) : null}
      </form>
    </Card>
  )
}

function TimeInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <input
      type="time"
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="h-11 rounded-field border border-border-default bg-surface px-3 text-aux text-foreground outline-none transition-colors hover:border-border-hover focus:border-focus focus:shadow-focus disabled:cursor-not-allowed disabled:opacity-60"
    />
  )
}
