'use client'

import { AlertCircle, CheckCircle2, ClipboardList, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { TextField } from '@/components/ui/text-field'
import { formatShortDate } from '@/lib/utils/date'
import { formatCents } from '@/lib/utils/money'

import { createPayableAction } from '../actions/createPayable.action'
import { settlePayableAction } from '../actions/settlePayable.action'
import {
  paymentMethodOptions,
  type PayableDto,
} from '../schemas/billing.schema'
import { NewPayableModal } from './NewPayableModal'

export interface PayablesPanelProps {
  payables: readonly PayableDto[]
  canManage: boolean
  isLive: boolean
}

const statusMeta: Record<PayableDto['status'], { label: string; tone: StatusTone }> = {
  open: { label: 'Em aberto', tone: 'pending' },
  overdue: { label: 'Vencida', tone: 'negative' },
  paid: { label: 'Paga', tone: 'positive' },
}

export function PayablesPanel({ payables, canManage, isLive }: PayablesPanelProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const [settling, setSettling] = useState<PayableDto | null>(null)
  const [method, setMethod] = useState('pix')
  const [error, setError] = useState<string | null>(null)
  const [isSettling, setIsSettling] = useState(false)

  const summary = useMemo(
    () =>
      payables.reduce(
        (result, payable) => {
          result.total += payable.amountCents
          if (payable.status !== 'paid') result.open += payable.amountCents
          if (payable.status === 'overdue') result.overdue += 1
          return result
        },
        { total: 0, open: 0, overdue: 0 },
      ),
    [payables],
  )

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function settle() {
    if (!settling) return
    setError(null)
    setIsSettling(true)

    try {
      const result = await settlePayableAction({
        payableId: settling.id,
        method,
      })

      if (!result.ok) {
        setError(result.error.message)
        return
      }

      setSettling(null)
      refresh()
    } finally {
      setIsSettling(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Contas a pagar"
        description="Despesas vencidas e compromissos até os próximos 12 meses."
        action={
          canManage && isLive ? (
            <Button variant="secondary" onClick={() => setCreating(true)}>
              <Plus aria-hidden className="size-4" />
              Nova despesa
            </Button>
          ) : undefined
        }
      />

      {!isLive ? (
        <p className="mx-5 mb-5 rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted">
          Conecte o Supabase para registrar e baixar despesas. Nenhum valor é
          inventado no modo demonstração.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mx-5 mb-5 flex items-start gap-2 rounded-card border border-danger/30 bg-danger/5 px-4 py-3 text-aux text-danger"
        >
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 border-y border-border-card px-5 py-4 md:grid-cols-4">
        <SummaryItem label="Compromissos listados" value={String(payables.length)} />
        <SummaryItem label="Valor listado" value={formatCents(summary.total)} />
        <SummaryItem label="Em aberto" value={formatCents(summary.open)} />
        <SummaryItem label="Vencidas" value={String(summary.overdue)} tone="danger" />
      </div>

      {payables.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma conta a pagar encontrada."
          description="Cadastre despesas reais para acompanhar vencimentos e baixas."
        />
      ) : (
        <ul className="divide-y divide-border-card">
          {payables.map((payable) => {
            const meta = statusMeta[payable.status]
            return (
              <li
                key={payable.id}
                className="flex flex-wrap items-center gap-3 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-aux font-semibold text-foreground">
                    {payable.description}
                  </p>
                  <p className="truncate text-label text-muted">
                    {payable.supplier ?? 'Fornecedor não informado'} · vence{' '}
                    {formatShortDate(new Date(`${payable.dueDate}T00:00:00`))}
                    {payable.category ? ` · ${payable.category}` : ''}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-aux font-semibold text-foreground">
                    {formatCents(payable.amountCents)}
                  </p>
                  {payable.status === 'paid' && payable.paidAt ? (
                    <p className="text-label text-muted">
                      baixada em {formatShortDate(new Date(payable.paidAt))}
                    </p>
                  ) : null}
                </div>

                <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>

                {canManage && isLive && payable.status !== 'paid' ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setError(null)
                      setMethod('pix')
                      setSettling(payable)
                    }}
                  >
                    Baixar despesa
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      <NewPayableModal
        open={creating}
        onOpenChange={setCreating}
        onSubmit={async (values) => {
          const result = await createPayableAction(values)
          if (!result.ok) return result.error.message
          setError(null)
          refresh()
          return null
        }}
      />

      <Modal
        open={settling !== null}
        onOpenChange={(open) => {
          if (!open && !isSettling) setSettling(null)
        }}
        title="Baixar conta a pagar"
        description={settling ? `${settling.description} · ${formatCents(settling.amountCents)}` : undefined}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setSettling(null)}
              disabled={isSettling}
            >
              Cancelar
            </Button>
            <Button onClick={settle} isLoading={isSettling}>
              <CheckCircle2 aria-hidden className="size-4" />
              {isSettling ? 'Baixando…' : 'Confirmar baixa'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <SelectField
            label="Forma de pagamento"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
            options={paymentMethodOptions.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
          />
          <TextField
            label="Valor baixado"
            value={settling ? formatCents(settling.amountCents) : ''}
            readOnly
            hint="A baixa usa o valor persistido da despesa; ele não é digitado no navegador."
          />
        </div>
      </Modal>
    </Card>
  )
}

function SummaryItem({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'danger'
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-label text-muted">{label}</p>
      <p className={tone === 'danger' ? 'text-aux font-semibold text-danger' : 'text-aux font-semibold text-foreground'}>
        {value}
      </p>
    </div>
  )
}
