'use client'

import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { TextField } from '@/components/ui/text-field'
import { TextareaField } from '@/components/ui/textarea-field'

import type { AuthorizationDto } from '../schemas/insurance.schema'

export interface AnswerAuthorizationModalProps {
  authorization: AuthorizationDto | null
  onOpenChange: (open: boolean) => void
  onSubmit: (
    values:
      | {
          authorizationId: string
          outcome: 'approved'
          authorizationNumber: string
          expiresAt: string
        }
      | {
          authorizationId: string
          outcome: 'denied'
          denialReason: string
        },
  ) => Promise<string | null>
}

/**
 * Resposta da operadora — feature **V-01**.
 *
 * # Aprovar e negar pedem coisas diferentes
 *
 * Aprovação sem número não serve: o faturamento vai precisar dele, e a falta só
 * aparece depois do atendimento prestado. Negativa sem motivo também não: o
 * texto da operadora é o que sustenta o recurso, e reconstruí-lo de memória
 * semanas depois não funciona.
 *
 * Por isso o formulário troca de campos conforme o desfecho, e o schema do
 * servidor é uma união discriminada — não dois campos opcionais.
 */
export function AnswerAuthorizationModal({
  authorization,
  onOpenChange,
  onSubmit,
}: AnswerAuthorizationModalProps) {
  const [outcome, setOutcome] = useState<'approved' | 'denied'>('approved')
  const [authorizationNumber, setAuthorizationNumber] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [denialReason, setDenialReason] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!authorization) return

    setError(null)
    setSubmitting(true)

    try {
      const failure = await onSubmit(
        outcome === 'approved'
          ? {
              authorizationId: authorization.id,
              outcome: 'approved',
              authorizationNumber,
              expiresAt,
            }
          : {
              authorizationId: authorization.id,
              outcome: 'denied',
              denialReason,
            },
      )

      if (failure) setError(failure)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={authorization !== null}
      onOpenChange={onOpenChange}
      title="Resposta da operadora"
      description={
        authorization
          ? `${authorization.patientName} · ${authorization.providerName}`
          : undefined
      }
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button type="submit" form="answer-form" isLoading={isSubmitting}>
            {isSubmitting ? 'Registrando...' : 'Registrar resposta'}
          </Button>
        </>
      }
    >
      <form
        id="answer-form"
        noValidate
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        {error ? (
          <p
            role="alert"
            className="rounded-card border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-aux text-danger"
          >
            {error}
          </p>
        ) : null}

        <div role="radiogroup" aria-label="Desfecho" className="flex gap-2">
          <Button
            type="button"
            role="radio"
            aria-checked={outcome === 'approved'}
            variant={outcome === 'approved' ? 'primary' : 'secondary'}
            onClick={() => setOutcome('approved')}
          >
            Autorizada
          </Button>
          <Button
            type="button"
            role="radio"
            aria-checked={outcome === 'denied'}
            variant={outcome === 'denied' ? 'primary' : 'secondary'}
            onClick={() => setOutcome('denied')}
          >
            Negada
          </Button>
        </div>

        {outcome === 'approved' ? (
          <>
            <TextField
              label="Número da autorização"
              value={authorizationNumber}
              onChange={(event) => setAuthorizationNumber(event.target.value)}
              hint="O número que a operadora devolveu. O faturamento vai precisar dele."
              maxLength={60}
            />
            <TextField
              label="Válida até"
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
              hint="Opcional, mas sem ela ninguém sabe até quando a guia vale."
            />
          </>
        ) : (
          <TextareaField
            label="Motivo informado pela operadora"
            value={denialReason}
            onChange={(event) => setDenialReason(event.target.value)}
            hint="Transcreva como veio. É este texto que sustenta o recurso."
            rows={4}
            maxLength={500}
          />
        )}

        {/*
          A resposta é registrada uma vez. Reescrevê-la apagaria o motivo da
          negativa, e o servidor recusa — o aviso evita a tentativa.
        */}
        <p className="text-label text-muted">
          A resposta não pode ser alterada depois. Em caso de recurso, abra uma
          nova guia.
        </p>
      </form>
    </Modal>
  )
}
