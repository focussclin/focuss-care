'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { TextField } from '@/components/ui/text-field'
import { formatCents, parseCents } from '@/lib/utils/money'

import { billingMessages } from '../schemas/billing.schema'

export interface InvoicePatientOption {
  id: string
  name: string
}

interface DraftItem {
  key: string
  description: string
  quantity: string
  unitPrice: string
}

export interface NewInvoiceSubmitFailure {
  message: string
  fieldErrors?: Record<string, string>
}

export interface NewInvoiceModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patients: readonly InvoicePatientOption[]
  onSubmit: (values: {
    patientId: string
    items: { description: string; quantity: string; unitPrice: string; discount: string }[]
    discount: string
    dueDate: string
    notes: string
  }) => Promise<NewInvoiceSubmitFailure | null>
}

let nextKey = 0

function emptyItem(): DraftItem {
  nextKey += 1
  return { key: `item-${nextKey}`, description: '', quantity: '1', unitPrice: '' }
}

/**
 * Nova cobrança — feature **B-01**.
 *
 * # A soma na tela é conferência, não contrato
 *
 * O total exibido aqui existe para a pessoa conferir antes de salvar. O número
 * que vale é o que o servidor recalcula: o formulário envia quantidade e preço
 * unitário, e nunca um total. Quem controla o total controla quanto o paciente
 * deve — e o formulário roda no navegador do usuário.
 */
export function NewInvoiceModal({
  open,
  onOpenChange,
  patients,
  onSubmit,
}: NewInvoiceModalProps) {
  const [patientId, setPatientId] = useState('')
  const [items, setItems] = useState<DraftItem[]>([emptyItem()])
  const [discount, setDiscount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const subtotalCents = items.reduce((total, item) => {
    const unit = parseCents(item.unitPrice) ?? 0
    const quantity = Number(item.quantity) || 0
    return total + unit * quantity
  }, 0)

  const totalCents = Math.max(subtotalCents - (parseCents(discount) ?? 0), 0)

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    )
  }

  function reset() {
    setPatientId('')
    setItems([emptyItem()])
    setDiscount('')
    setDueDate('')
    setNotes('')
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const failure = await onSubmit({
        patientId,
        items: items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: '0',
        })),
        discount: discount || '0',
        dueDate,
        notes,
      })

      if (failure) {
        setError(failure.message)
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
      title="Nova cobrança"
      description="Registre o que o paciente deve. Não emite documento fiscal."
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button type="submit" form="new-invoice-form" isLoading={isSubmitting}>
            {isSubmitting ? 'Salvando...' : 'Salvar cobrança'}
          </Button>
        </>
      }
    >
      <form
        id="new-invoice-form"
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
          label="Paciente"
          value={patientId}
          onChange={(event) => setPatientId(event.target.value)}
          options={[
            { value: '', label: 'Selecione o paciente' },
            ...patients.map((patient) => ({
              value: patient.id,
              label: patient.name,
            })),
          ]}
        />

        <div className="flex flex-col gap-3">
          {items.map((item, index) => (
            <div
              key={item.key}
              className="flex flex-col gap-3 rounded-card border border-border-card p-3 sm:flex-row sm:items-end"
            >
              <div className="min-w-0 flex-1">
                <TextField
                  label={`Item ${index + 1}`}
                  value={item.description}
                  onChange={(event) =>
                    updateItem(item.key, { description: event.target.value })
                  }
                  placeholder="Consulta, procedimento, material…"
                  maxLength={200}
                />
              </div>

              <div className="w-full sm:w-24">
                <TextField
                  label="Qtd."
                  value={item.quantity}
                  inputMode="numeric"
                  onChange={(event) =>
                    updateItem(item.key, { quantity: event.target.value })
                  }
                />
              </div>

              <div className="w-full sm:w-36">
                <TextField
                  label="Valor unit."
                  value={item.unitPrice}
                  inputMode="decimal"
                  placeholder="150,00"
                  onChange={(event) =>
                    updateItem(item.key, { unitPrice: event.target.value })
                  }
                />
              </div>

              {items.length > 1 ? (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() =>
                    setItems((current) =>
                      current.filter((entry) => entry.key !== item.key),
                    )
                  }
                >
                  <Trash2 aria-hidden className="size-4" />
                  <span className="sr-only">Remover item {index + 1}</span>
                </Button>
              ) : null}
            </div>
          ))}

          <Button
            variant="secondary"
            type="button"
            onClick={() => setItems((current) => [...current, emptyItem()])}
          >
            <Plus aria-hidden className="size-4" />
            Adicionar item
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Desconto"
            value={discount}
            inputMode="decimal"
            placeholder="0,00"
            onChange={(event) => setDiscount(event.target.value)}
          />
          <TextField
            label="Vencimento"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>

        <TextField
          label="Observação"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          hint="Opcional. Fica visível para quem cuida do financeiro."
          maxLength={300}
        />

        {/*
          Conferência, não contrato: o servidor refaz esta conta antes de gravar.
        */}
        <div className="flex items-center justify-between border-t border-border-card pt-4">
          <span className="text-aux text-muted">Total da cobrança</span>
          <span className="text-card-title font-semibold text-foreground">
            {formatCents(totalCents)}
          </span>
        </div>

        <p className="text-label text-muted">
          {billingMessages.issueUnavailable}
        </p>
      </form>
    </Modal>
  )
}
