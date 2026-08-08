'use client'

import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { TextField } from '@/components/ui/text-field'
import { formatCents } from '@/lib/utils/money'

import {
  paymentMethodOptions,
  type InvoiceDto,
} from '../schemas/billing.schema'

export interface PaymentModalProps {
  invoice: InvoiceDto | null
  onOpenChange: (open: boolean) => void
  onConfirm: (values: {
    invoiceId: string
    amount: string
    method: string
    notes: string
  }) => Promise<string | null>
}

/**
 * Registro de pagamento — feature **B-01**.
 *
 * O campo de valor abre **preenchido com o saldo devedor**, e não vazio: o caso
 * comum, de longe, é o paciente pagar o que falta. Deixar em branco faria a
 * recepção digitar um número que o sistema já sabe, e digitar valor de dinheiro
 * é onde o erro acontece.
 *
 * Pagamento parcial continua possível — basta alterar o campo.
 */
export function PaymentModal({
  invoice,
  onOpenChange,
  onConfirm,
}: PaymentModalProps) {
  /*
   * O estado nasce do saldo, e não é sincronizado por efeito.
   *
   * Quem monta a tela passa `key={invoice.id}`: trocar de cobrança remonta o
   * formulário, e o inicializador roda com o saldo certo. Um `useEffect` que
   * chamasse `setState` faria o mesmo com um render a mais — e com o risco de
   * apagar o que a pessoa já tivesse digitado.
   */
  const [amount, setAmount] = useState(() =>
    // Centavos -> texto editável, sem símbolo: o campo é de digitação.
    invoice ? (invoice.remainingCents / 100).toFixed(2).replace('.', ',') : '',
  )
  const [method, setMethod] = useState<string>('pix')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!invoice) return

    setError(null)
    setSubmitting(true)

    try {
      const failure = await onConfirm({
        invoiceId: invoice.id,
        amount,
        method,
        notes,
      })

      if (failure) {
        setError(failure)
        return
      }

      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={invoice !== null}
      onOpenChange={onOpenChange}
      title="Registrar pagamento"
      description={
        invoice
          ? `${invoice.patientName} · saldo de ${formatCents(invoice.remainingCents)}`
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
          <Button type="submit" form="payment-form" isLoading={isSubmitting}>
            {isSubmitting ? 'Registrando...' : 'Registrar pagamento'}
          </Button>
        </>
      }
    >
      <form
        id="payment-form"
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
          label="Valor recebido"
          value={amount}
          inputMode="decimal"
          onChange={(event) => setAmount(event.target.value)}
          hint="Pode ser menor que o saldo, para pagamento parcial."
        />

        <SelectField
          label="Forma de pagamento"
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          options={paymentMethodOptions.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />

        {method === 'cash' ? (
          <p className="text-label text-muted">
            Pagamentos em dinheiro entram no caixa aberto, para que o
            fechamento do turno bata com a gaveta.
          </p>
        ) : null}

        <TextField
          label="Observação"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          hint="Opcional."
          maxLength={300}
        />
      </form>
    </Modal>
  )
}
