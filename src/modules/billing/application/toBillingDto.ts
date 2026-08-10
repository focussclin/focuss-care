import type {
  CashEntry,
  FinanceSummary,
  Invoice,
  OpenCashSession,
  Payable,
} from '../domain/Billing'
import type {
  CashEntryDto,
  CashSessionDto,
  FinanceSummaryDto,
  InvoiceDto,
  PayableDto,
} from '../schemas/billing.schema'

/**
 * Entidade -> o que atravessa a fronteira.
 *
 * `remainingCents` viaja PRONTO. A tela não subtrai dinheiro: uma subtração
 * repetida em dois lugares é uma chance de os dois discordarem, e é o número que
 * a recepção lê para dizer ao paciente quanto falta.
 *
 * `patientId` NÃO viaja: a tela mostra nome, e o id só serviria para alguém
 * mandá-lo de volta.
 */
export function toInvoiceDto(invoice: Invoice): InvoiceDto {
  return {
    id: invoice.id,
    patientName: invoice.patientName,
    number: invoice.number,
    status: invoice.status,
    totalCents: invoice.totalCents,
    paidCents: invoice.paidCents,
    remainingCents: Math.max(invoice.totalCents - invoice.paidCents, 0),
    dueDate: invoice.dueDate?.toISOString() ?? null,
    createdAt: invoice.createdAt.toISOString(),
    items: invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      totalCents: item.totalCents,
    })),
    payments: invoice.payments.map((payment) => ({
      id: payment.id,
      amountCents: payment.amountCents,
      method: payment.method,
      paidAt: payment.paidAt.toISOString(),
      notes: payment.notes,
    })),
  }
}

export function toCashEntryDto(entry: CashEntry): CashEntryDto {
  return {
    id: entry.id,
    kind: entry.kind,
    amountCents: entry.amountCents,
    description: entry.description,
    createdAt: entry.createdAt.toISOString(),
  }
}

export function toCashSessionDto(open: OpenCashSession): CashSessionDto {
  return {
    id: open.session.id,
    openedAt: open.session.openedAt.toISOString(),
    openedByName: open.session.openedByName,
    openingAmountCents: open.session.openingAmountCents,
    expectedCents: open.expectedCents,
    entries: open.entries.map(toCashEntryDto),
  }
}

export function toFinanceSummaryDto(
  summary: FinanceSummary,
): FinanceSummaryDto {
  return {
    receivedCents: summary.receivedCents,
    openCents: summary.openCents,
    openInvoices: summary.openInvoices,
    issuedInvoices: summary.issuedInvoices,
  }
}

export function toPayableDto(payable: Payable): PayableDto {
  return {
    id: payable.id,
    description: payable.description,
    category: payable.category,
    supplier: payable.supplier,
    amountCents: payable.amountCents,
    dueDate: payable.dueDate.toISOString().slice(0, 10),
    paidAt: payable.paidAt?.toISOString() ?? null,
    paidAmountCents: payable.paidAmountCents,
    method: payable.method,
    isRecurring: payable.isRecurring,
    status: payable.status,
    notes: payable.notes,
  }
}
