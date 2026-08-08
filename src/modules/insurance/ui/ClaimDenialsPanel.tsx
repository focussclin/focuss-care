'use client'

import { AlertTriangle, Check, FileWarning, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { SelectField } from '@/components/ui/select-field'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { TextField } from '@/components/ui/text-field'
import { formatShortDate } from '@/lib/utils/date'
import { formatCents } from '@/lib/utils/money'

import {
  createClaimDenialAction,
  updateClaimDenialAction,
} from '../actions/claimDenials.action'
import {
  claimDenialStatusLabels,
  insuranceMessages,
  type ClaimDenialDto,
  type ClaimInvoiceOptionDto,
} from '../schemas/insurance.schema'

export interface ClaimDenialsPanelProps {
  denials: readonly ClaimDenialDto[]
  invoices: readonly ClaimInvoiceOptionDto[]
  canManage: boolean
  isLive: boolean
}

const statusTone: Record<string, StatusTone> = {
  received: 'pending',
  appealing: 'pending',
  recovered: 'positive',
  accepted: 'negative',
}

export function ClaimDenialsPanel({
  denials,
  invoices,
  canManage,
  isLive,
}: ClaimDenialsPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const [recovering, setRecovering] = useState<string | null>(null)
  const [invoiceId, setInvoiceId] = useState(invoices[0]?.id ?? '')
  const [denialCode, setDenialCode] = useState('')
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState('')
  const [deniedAt, setDeniedAt] = useState(today())
  const [notes, setNotes] = useState('')
  const [recoveredAmount, setRecoveredAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  const editable = canManage && isLive

  function run(operation: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null)
    startTransition(async () => {
      try {
        const result = await operation()
        if (!result.ok) {
          setError(result.message ?? insuranceMessages.unexpected)
          return
        }
        setRecovering(null)
        setRecoveredAmount('')
        router.refresh()
      } catch {
        setError(insuranceMessages.unavailable)
      }
    })
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    run(async () => {
      const result = await createClaimDenialAction({
        invoiceId,
        denialCode,
        reason,
        amount,
        deniedAt,
        notes,
      })

      if (result.ok) {
        setCreating(false)
        setDenialCode('')
        setReason('')
        setAmount('')
        setNotes('')
      }

      return { ok: result.ok, message: result.ok ? undefined : result.error.message }
    })
  }

  function updateStatus(
    denial: ClaimDenialDto,
    status: 'appealing' | 'accepted' | 'recovered',
  ) {
    run(async () => {
      const result = await updateClaimDenialAction(
        status === 'recovered'
          ? {
              denialId: denial.id,
              status,
              recoveredAmount,
              notes: denial.notes ?? '',
            }
          : { denialId: denial.id, status, notes: denial.notes ?? '' },
      )

      return { ok: result.ok, message: result.ok ? undefined : result.error.message }
    })
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Glosas"
        description="Recusas de pagamento após o atendimento e o acompanhamento dos recursos."
        action={
          editable ? (
            <Button variant="secondary" onClick={() => setCreating((value) => !value)}>
              <Plus aria-hidden className="size-4" />
              {creating ? 'Fechar' : 'Registrar glosa'}
            </Button>
          ) : undefined
        }
      />

      {creating ? (
        <form
          onSubmit={handleCreate}
          className="grid gap-4 border-y border-border-card px-5 py-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <div className="sm:col-span-2 lg:col-span-4">
            <SelectField
              label="Fatura do convênio"
              value={invoiceId}
              onChange={(event) => setInvoiceId(event.target.value)}
              disabled={invoices.length === 0}
              options={
                invoices.length > 0
                  ? invoices.map((invoice) => ({ value: invoice.id, label: invoice.label }))
                  : [{ value: '', label: 'Nenhuma fatura de convênio disponível' }]
              }
            />
          </div>
          <TextField
            label="Código da glosa"
            value={denialCode}
            onChange={(event) => setDenialCode(event.target.value)}
            maxLength={30}
            placeholder="Opcional"
          />
          <TextField
            label="Valor glosado"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            required
            placeholder="0,00"
          />
          <TextField
            label="Data da glosa"
            type="date"
            value={deniedAt}
            onChange={(event) => setDeniedAt(event.target.value)}
            required
          />
          <TextField
            label="Motivo informado"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            required
            className="lg:col-span-2"
          />
          <TextField
            label="Observações"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={500}
            placeholder="Opcional"
            className="lg:col-span-2"
          />
          <div className="flex justify-end sm:col-span-2 lg:col-span-4">
            <Button type="submit" isLoading={isPending} disabled={!invoiceId}>
              <Check aria-hidden className="size-4" />
              Salvar glosa
            </Button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="mx-5 mt-4 rounded-field border border-danger/30 bg-danger-surface px-3 py-2 text-label text-danger">
          {error}
        </p>
      ) : null}

      {denials.length === 0 ? (
        <EmptyState
          icon={FileWarning}
          title="Nenhuma glosa registrada."
          description={
            editable
              ? 'Registre a primeira recusa de pagamento para acompanhar o recurso e o valor recuperado.'
              : 'As recusas de pagamento do convênio aparecerão aqui.'
          }
        />
      ) : (
        <ul className="divide-y divide-border-card border-t border-border-card">
          {denials.map((denial) => (
            <li key={denial.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-status-pending" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-aux font-semibold text-foreground">
                    {denial.patientName} · {formatCents(denial.amountCents)}
                  </p>
                  {denial.denialCode ? (
                    <span className="text-label text-muted">Código {denial.denialCode}</span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-label text-muted">
                  Fatura {denial.invoiceNumber ? `nº ${denial.invoiceNumber}` : denial.invoiceId.slice(0, 8)} · {denial.planName} · {formatShortDate(new Date(denial.deniedAt))}
                </p>
                <p className="mt-2 text-aux text-foreground">{denial.reason}</p>
                {denial.recoveredCents !== null ? (
                  <p className="mt-1 text-label text-status-positive">
                    Recuperado: {formatCents(denial.recoveredCents)}
                  </p>
                ) : null}
              </div>

              <StatusBadge tone={statusTone[denial.status] ?? 'neutral'}>
                {claimDenialStatusLabels[denial.status] ?? denial.status}
              </StatusBadge>

              {editable && denial.status === 'received' ? (
                <div className="flex flex-wrap gap-2 sm:w-full sm:justify-end">
                  <Button variant="secondary" disabled={isPending} onClick={() => updateStatus(denial, 'appealing')}>
                    Enviar para recurso
                  </Button>
                  <Button variant="ghost" disabled={isPending} onClick={() => updateStatus(denial, 'accepted')}>
                    Aceitar prejuízo
                  </Button>
                </div>
              ) : null}

              {editable && denial.status === 'appealing' ? (
                recovering === denial.id ? (
                  <div className="flex w-full flex-wrap items-end justify-end gap-2">
                    <TextField
                      label="Valor recuperado"
                      value={recoveredAmount}
                      onChange={(event) => setRecoveredAmount(event.target.value)}
                      inputMode="decimal"
                      placeholder="0,00"
                    />
                    <Button disabled={isPending || !recoveredAmount} onClick={() => updateStatus(denial, 'recovered')}>
                      Confirmar recuperação
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 sm:w-full sm:justify-end">
                    <Button variant="secondary" disabled={isPending} onClick={() => setRecovering(denial.id)}>
                      Registrar recuperação
                    </Button>
                    <Button variant="ghost" disabled={isPending} onClick={() => updateStatus(denial, 'accepted')}>
                      Aceitar prejuízo
                    </Button>
                  </div>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function today(): string {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
