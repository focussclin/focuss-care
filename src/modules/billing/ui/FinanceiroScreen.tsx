'use client'

import {
  Clock3,
  FileText,
  Info,
  Plus,
  Receipt,
  WalletCards,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { formatShortDate } from '@/lib/utils/date'
import { formatCents } from '@/lib/utils/money'

import { cancelInvoiceAction } from '../actions/cancelInvoice.action'
import {
  addCashEntryAction,
  closeCashSessionAction,
  openCashSessionAction,
} from '../actions/cashSession.action'
import { createInvoiceAction } from '../actions/createInvoice.action'
import { registerPaymentAction } from '../actions/registerPayment.action'
import {
  billingMessages,
  type CashSessionDto,
  type FinanceSummaryDto,
  type InvoiceDto,
  type PayableDto,
} from '../schemas/billing.schema'
import { CashSessionCard } from './CashSessionCard'
import { NewInvoiceModal, type InvoicePatientOption } from './NewInvoiceModal'
import { PaymentModal } from './PaymentModal'
import { PayablesPanel } from './PayablesPanel'

export interface FinanceiroScreenProps {
  summary: FinanceSummaryDto
  invoices: readonly InvoiceDto[]
  payables: readonly PayableDto[]
  cashSession: CashSessionDto | null
  patients: readonly InvoicePatientOption[]
  periodLabel: string
  canWriteInvoice: boolean
  canRegisterPayment: boolean
  canManageCash: boolean
  canManagePayables: boolean
  isLive?: boolean
}

const statusMeta: Record<string, { label: string; tone: StatusTone }> = {
  draft: { label: 'Em aberto', tone: 'pending' },
  issued: { label: 'Emitida', tone: 'pending' },
  partially_paid: { label: 'Parcial', tone: 'pending' },
  paid: { label: 'Paga', tone: 'positive' },
  overdue: { label: 'Vencida', tone: 'negative' },
  canceled: { label: 'Cancelada', tone: 'negative' },
}

/**
 * Financeiro — feature **B-01**.
 *
 * Substitui a tela de vitrine que vivia em `OperationsScreens.tsx`, onde
 * "R$ 18.420 de receitas", um gráfico de barras com alturas literais e doze
 * cobranças em aberto estavam escritos no arquivo.
 *
 * # O que sumiu junto com a vitrine, e não voltou
 *
 * **Despesas e saldo do período.** As contas a pagar têm painel próprio abaixo:
 * a tela não mistura despesa com receita recebida e não apresenta um saldo
 * calculado com dados de despesas que não foram carregados.
 *
 * **O gráfico de fluxo.** Ele precisa de série temporal agregada, que o
 * PostgREST não faz sem view — e view exige migration (B1). Um gráfico com dois
 * pontos reais e três inventados é pior que nenhum.
 */
export function FinanceiroScreen({
  summary,
  invoices,
  payables,
  cashSession,
  patients,
  periodLabel,
  canWriteInvoice,
  canRegisterPayment,
  canManageCash,
  canManagePayables,
  isLive = false,
}: FinanceiroScreenProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [creating, setCreating] = useState(false)
  const [paying, setPaying] = useState<InvoiceDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    startTransition(() => router.refresh())
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestão da clínica"
        title="Financeiro"
        description="Cobranças, recebimentos e o caixa do dia."
        actions={
          canWriteInvoice && isLive ? (
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden className="size-4" />
              Nova cobrança
            </Button>
          ) : undefined
        }
      />

      {isLive ? null : (
        <p
          role="status"
          className="rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted"
        >
          Modo demonstração: não há financeiro sem banco, e esta tela não inventa
          um. Nenhum valor abaixo é de exemplo.
        </p>
      )}

      {error ? (
        <p
          role="alert"
          className="rounded-card border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
        >
          {error}
        </p>
      ) : null}

      <p className="text-label text-muted">{periodLabel}</p>

      <section aria-label="Resumo financeiro">
        <div className="grid grid-cols-2 gap-4 nav:grid-cols-4">
          <StatCard
            label="Recebido no período"
            value={formatCents(summary.receivedCents)}
            icon={WalletCards}
          />
          <StatCard
            label="A receber"
            value={formatCents(summary.openCents)}
            icon={Clock3}
            tone="attention"
          />
          <StatCard
            label="Cobranças em aberto"
            value={String(summary.openInvoices)}
            icon={FileText}
          />
          <StatCard
            label="Cobranças no período"
            value={String(summary.issuedInvoices)}
            icon={Receipt}
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,.6fr)]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Cobranças"
            description="Registro interno do que cada paciente deve."
          />

          {invoices.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Nenhuma cobrança neste período."
              description="As cobranças criadas aparecem aqui, com o que já foi pago."
            />
          ) : (
            <ul className="divide-y divide-border-card border-t border-border-card">
              {invoices.map((invoice) => {
                const meta = statusMeta[invoice.status]
                const canPay =
                  canRegisterPayment &&
                  isLive &&
                  invoice.remainingCents > 0 &&
                  invoice.status !== 'canceled'

                return (
                  <li
                    key={invoice.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-aux font-semibold text-foreground">
                        {invoice.patientName}
                      </p>
                      <p className="truncate text-label text-muted">
                        {formatShortDate(new Date(invoice.createdAt))} ·{' '}
                        {invoice.items.length}{' '}
                        {invoice.items.length === 1 ? 'item' : 'itens'}
                        {invoice.dueDate
                          ? ` · vence ${formatShortDate(new Date(invoice.dueDate))}`
                          : ''}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-aux font-semibold text-foreground">
                        {formatCents(invoice.totalCents)}
                      </p>
                      {invoice.remainingCents > 0 &&
                      invoice.status !== 'canceled' ? (
                        <p className="text-label text-muted">
                          faltam {formatCents(invoice.remainingCents)}
                        </p>
                      ) : null}
                    </div>

                    {meta ? (
                      <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                    ) : null}

                    <div className="flex items-center gap-2">
                      {canPay ? (
                        <Button
                          variant="secondary"
                          onClick={() => setPaying(invoice)}
                        >
                          Registrar pagamento
                        </Button>
                      ) : null}

                      {canWriteInvoice &&
                      isLive &&
                      invoice.paidCents === 0 &&
                      invoice.status !== 'canceled' ? (
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            setError(null)
                            const result = await cancelInvoiceAction({
                              invoiceId: invoice.id,
                              reason: '',
                            })
                            if (!result.ok) setError(result.error.message)
                            else refresh()
                          }}
                        >
                          Cancelar
                        </Button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <CashSessionCard
          session={cashSession}
          canManage={canManageCash}
          isLive={isLive}
          onOpen={async (openingAmount) => {
            const result = await openCashSessionAction({ openingAmount })
            if (!result.ok) return result.error.message
            refresh()
            return null
          }}
          onEntry={async (values) => {
            const result = await addCashEntryAction(values)
            if (!result.ok) return result.error.message
            refresh()
            return null
          }}
          onClose={async (values) => {
            const result = await closeCashSessionAction(values)
            if (!result.ok) return result.error.message
            refresh()
            return null
          }}
        />
      </div>

      <p className="flex items-start gap-2.5 text-label text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {billingMessages.issueUnavailable}
      </p>

      <PayablesPanel
        payables={payables}
        canManage={canManagePayables}
        isLive={isLive}
      />

      <NewInvoiceModal
        open={creating}
        onOpenChange={setCreating}
        patients={patients}
        onSubmit={async (values) => {
          const result = await createInvoiceAction(values)

          if (!result.ok) {
            return {
              message: result.error.message,
              fieldErrors: result.error.fieldErrors,
            }
          }

          refresh()
          return null
        }}
      />

      {/*
        `key` remonta o formulário a cada cobrança: é o que faz o campo de valor
        nascer com o saldo certo sem um efeito sincronizando estado.
      */}
      <PaymentModal
        key={paying?.id ?? 'sem-cobranca'}
        invoice={paying}
        onOpenChange={(open) => {
          if (!open) setPaying(null)
        }}
        onConfirm={async (values) => {
          const result = await registerPaymentAction(values)
          if (!result.ok) return result.error.message

          setPaying(null)
          refresh()
          return null
        }}
      />
    </div>
  )
}
