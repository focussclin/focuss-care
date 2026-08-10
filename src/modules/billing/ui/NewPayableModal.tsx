'use client'

import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { TextareaField } from '@/components/ui/textarea-field'
import { TextField } from '@/components/ui/text-field'

export interface NewPayableModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: {
    description: string
    category: string
    supplier: string
    amount: string
    dueDate: string
    isRecurring: boolean
    notes: string
  }) => Promise<string | null>
}

export function NewPayableModal({
  open,
  onOpenChange,
  onSubmit,
}: NewPayableModalProps) {
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [supplier, setSupplier] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [isRecurring, setRecurring] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setSubmitting] = useState(false)

  function reset() {
    setDescription('')
    setCategory('')
    setSupplier('')
    setAmount('')
    setDueDate('')
    setRecurring(false)
    setNotes('')
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const failure = await onSubmit({
        description,
        category,
        supplier,
        amount,
        dueDate,
        isRecurring,
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
      title="Nova conta a pagar"
      description="Registre uma despesa real da clínica para acompanhar o vencimento."
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button type="submit" form="new-payable-form" isLoading={isSubmitting}>
            {isSubmitting ? 'Salvando…' : 'Salvar despesa'}
          </Button>
        </>
      }
    >
      <form
        id="new-payable-form"
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

        <TextField
          label="Descrição"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Aluguel, fornecedor, software…"
          maxLength={200}
          required
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Valor"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder="1.250,00"
            required
          />
          <TextField
            label="Vencimento"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Categoria"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Operação, pessoal, estrutura…"
            maxLength={100}
          />
          <TextField
            label="Fornecedor"
            value={supplier}
            onChange={(event) => setSupplier(event.target.value)}
            placeholder="Nome do fornecedor"
            maxLength={160}
          />
        </div>

        <label className="flex min-h-11 items-center gap-3 rounded-field border border-border-default px-3.5 text-aux text-foreground">
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(event) => setRecurring(event.target.checked)}
            className="size-4 accent-brand"
          />
          <span>
            <span className="block font-semibold">Despesa recorrente</span>
            <span className="block text-label text-muted">
              Marca o compromisso para facilitar o próximo lançamento.
            </span>
          </span>
        </label>

        <TextareaField
          label="Observações"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Opcional"
          maxLength={500}
        />
      </form>
    </Modal>
  )
}
