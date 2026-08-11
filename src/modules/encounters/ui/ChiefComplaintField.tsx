'use client'

import { Pencil } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { TextareaField } from '@/components/ui/textarea-field'

import { setChiefComplaintAction } from '../actions/setChiefComplaint.action'
import { CHIEF_COMPLAINT_MAX_LENGTH } from '../domain/Encounter'
import { encounterMessages } from '../schemas/encounter.schema'

export interface ChiefComplaintFieldProps {
  encounterId: string
  /** `null` quando ninguém registrou ainda. Nunca `undefined` aqui. */
  value: string | null
  /** `record.write` **e** banco real. Falso deixa o texto só de leitura. */
  canWrite: boolean
  disabled?: boolean
}

/**
 * Queixa principal do atendimento — feature **E-03**.
 *
 * # Não é o motivo da chegada
 *
 * `waiting_queue.reason` é o que a recepção anotou no balcão. Esta é a queixa
 * registrada por quem atende, e é dela que sai a conduta. O componente só
 * aparece para quem tem `record.read` — a filtragem acontece no servidor, e a
 * prop nem chega preenchida para os outros papéis.
 *
 * # Fechado por padrão
 *
 * A tela de atendimentos é operacional: quem está com quem, e há quanto tempo.
 * Um campo de texto aberto em cada linha empurraria essa informação para baixo.
 * O texto registrado aparece como frase; editar é um clique.
 */
export function ChiefComplaintField({
  encounterId,
  value,
  canWrite,
  disabled = false,
}: ChiefComplaintFieldProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isEditing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [error, setError] = useState<string | null>(null)

  function save() {
    setError(null)

    startTransition(async () => {
      try {
        const result = await setChiefComplaintAction({
          encounterId,
          chiefComplaint: draft,
        })

        if (!result.ok) {
          setError(result.error.message)
          return
        }

        setEditing(false)
        router.refresh()
      } catch {
        setError(encounterMessages.unavailable)
      }
    })
  }

  if (!isEditing) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-label text-muted">
          <span className="font-semibold text-label">Queixa principal: </span>
          {value ?? 'não registrada'}
        </p>

        {canWrite ? (
          <Button
            variant="ghost"
            disabled={disabled || isPending}
            onClick={() => {
              setDraft(value ?? '')
              setEditing(true)
            }}
          >
            <Pencil aria-hidden className="size-3.5" />
            {value ? 'Editar' : 'Registrar'}
          </Button>
        ) : null}

        {error ? (
          <p role="alert" className="w-full text-label text-danger">
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <TextareaField
        label="Queixa principal"
        rows={2}
        value={draft}
        maxLength={CHIEF_COMPLAINT_MAX_LENGTH}
        disabled={isPending}
        hint="O que trouxe o paciente, em termos clínicos. Detalhes vão na evolução."
        onChange={(event) => setDraft(event.target.value)}
      />

      {error ? (
        <p role="alert" className="text-label text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={isPending} onClick={save}>
          {isPending ? 'Salvando…' : 'Salvar queixa'}
        </Button>
        <Button
          variant="ghost"
          disabled={isPending}
          onClick={() => {
            setEditing(false)
            setError(null)
          }}
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}
