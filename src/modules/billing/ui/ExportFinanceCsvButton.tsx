'use client'

import { Download } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { buildFinanceCsv } from '../application/financeCsv'
import type { InvoiceDto, PayableDto } from '../schemas/billing.schema'

export interface ExportFinanceCsvButtonProps {
  invoices: readonly InvoiceDto[]
  payables: readonly PayableDto[]
  periodLabel: string
  isLive: boolean
}

export function ExportFinanceCsvButton({
  invoices,
  payables,
  periodLabel,
  isLive,
}: ExportFinanceCsvButtonProps) {
  const hasRows = invoices.length > 0 || payables.length > 0

  function exportCsv() {
    if (!isLive || !hasRows) return

    const csv = buildFinanceCsv({ invoices, payables, periodLabel })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = `focuss-care-financeiro-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <Button
      variant="secondary"
      onClick={exportCsv}
      disabled={!isLive || !hasRows}
      title={
        !isLive
          ? 'A exportação exige conexão com o banco.'
          : !hasRows
            ? 'Não há lançamentos para exportar.'
            : 'Baixar cobranças e contas a pagar em CSV'
      }
      aria-label="Exportar financeiro em CSV"
    >
      <Download aria-hidden className="size-4" />
      Exportar CSV
    </Button>
  )
}
