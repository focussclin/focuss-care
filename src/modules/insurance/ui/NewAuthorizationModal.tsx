'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { TextField } from '@/components/ui/text-field'

import {
  insuranceMessages,
  type PatientInsuranceDto,
} from '../schemas/insurance.schema'

interface DraftProcedure {
  key: string
  code: string
  description: string
  quantity: string
}

export interface NewAuthorizationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  cards: readonly PatientInsuranceDto[]
  onSubmit: (values: {
    patientInsuranceId: string
    procedures: { code: string; description: string; quantity: string }[]
    notes: string
  }) => Promise<string | null>
}

let nextKey = 0

function emptyProcedure(): DraftProcedure {
  nextKey += 1
  return { key: `proc-${nextKey}`, code: '', description: '', quantity: '1' }
}

/**
 * Nova guia — feature **V-01**.
 *
 * # A carteirinha, e não o paciente
 *
 * O formulário escolhe uma CARTEIRINHA, que já carrega paciente e plano. Pedir
 * os dois separados permitiria montar uma combinação que não existe — paciente A
 * com a carteirinha de B — e a operadora só recusaria depois, com o atendimento
 * já marcado.
 *
 * Não há campo de número de autorização: **o número vem da operadora**, e é
 * registrado na resposta.
 */
export function NewAuthorizationModal({
  open,
  onOpenChange,
  cards,
  onSubmit,
}: NewAuthorizationModalProps) {
  const [cardId, setCardId] = useState('')
  const [procedures, setProcedures] = useState<DraftProcedure[]>([
    emptyProcedure(),
  ])
  const [notes, setNotes] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = cards.find((card) => card.id === cardId)
  const expired =
    selected?.validUntil !== null &&
    selected?.validUntil !== undefined &&
    new Date(selected.validUntil) < new Date()

  function reset() {
    setCardId('')
    setProcedures([emptyProcedure()])
    setNotes('')
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const failure = await onSubmit({
        patientInsuranceId: cardId,
        procedures: procedures.map((procedure) => ({
          code: procedure.code,
          description: procedure.description,
          quantity: procedure.quantity,
        })),
        notes,
      })

      if (failure) {
        setError(failure)
        return
      }

      reset()
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title="Nova guia"
      description="Pedido de autorização à operadora."
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="new-authorization-form"
            isLoading={isSubmitting}
          >
            {isSubmitting ? 'Enviando...' : 'Registrar solicitação'}
          </Button>
        </>
      }
    >
      <form
        id="new-authorization-form"
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

        <SelectField
          label="Carteirinha"
          value={cardId}
          onChange={(event) => setCardId(event.target.value)}
          options={[
            { value: '', label: 'Selecione a carteirinha' },
            ...cards.map((card) => ({ value: card.id, label: card.label })),
          ]}
        />

        {/*
          Aviso, e não bloqueio: a data é a que a clínica cadastrou, e pode estar
          desatualizada. Impedir a guia por causa dela seria confiar mais no
          cadastro local do que em quem está com o paciente na frente.
        */}
        {expired ? (
          <p
            role="alert"
            className="rounded-card border border-attention/30 bg-attention-surface px-3.5 py-2.5 text-aux text-foreground"
          >
            A validade cadastrada desta carteirinha já passou. Confirme com o
            paciente antes de enviar.
          </p>
        ) : null}

        <div className="flex flex-col gap-3">
          {procedures.map((procedure, index) => (
            <div
              key={procedure.key}
              className="flex flex-col gap-3 rounded-card border border-border-card p-3 sm:flex-row sm:items-end"
            >
              <div className="w-full sm:w-32">
                <TextField
                  label="Código"
                  value={procedure.code}
                  onChange={(event) =>
                    setProcedures((current) =>
                      current.map((item) =>
                        item.key === procedure.key
                          ? { ...item, code: event.target.value }
                          : item,
                      ),
                    )
                  }
                  hint="TUSS, se usar."
                  maxLength={20}
                />
              </div>

              <div className="min-w-0 flex-1">
                <TextField
                  label={`Procedimento ${index + 1}`}
                  value={procedure.description}
                  onChange={(event) =>
                    setProcedures((current) =>
                      current.map((item) =>
                        item.key === procedure.key
                          ? { ...item, description: event.target.value }
                          : item,
                      ),
                    )
                  }
                  maxLength={200}
                />
              </div>

              <div className="w-full sm:w-24">
                <TextField
                  label="Qtd."
                  value={procedure.quantity}
                  inputMode="numeric"
                  onChange={(event) =>
                    setProcedures((current) =>
                      current.map((item) =>
                        item.key === procedure.key
                          ? { ...item, quantity: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </div>

              {procedures.length > 1 ? (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() =>
                    setProcedures((current) =>
                      current.filter((item) => item.key !== procedure.key),
                    )
                  }
                >
                  <Trash2 aria-hidden className="size-4" />
                  <span className="sr-only">Remover procedimento {index + 1}</span>
                </Button>
              ) : null}
            </div>
          ))}

          <Button
            variant="secondary"
            type="button"
            onClick={() =>
              setProcedures((current) => [...current, emptyProcedure()])
            }
          >
            <Plus aria-hidden className="size-4" />
            Adicionar procedimento
          </Button>
        </div>

        <TextField
          label="Observação"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          hint="Opcional."
          maxLength={300}
        />

        <p className="text-label text-muted">
          {insuranceMessages.eligibilityUnavailable}
        </p>
      </form>
    </Modal>
  )
}
