import type {
  InvoiceDto,
  PayableDto,
} from '../schemas/billing.schema'

export interface FinanceCsvInput {
  invoices: readonly InvoiceDto[]
  payables: readonly PayableDto[]
  periodLabel: string
}

const columns = [
  'periodo',
  'tipo',
  'referencia',
  'descricao',
  'pessoa_ou_fornecedor',
  'status',
  'criado_em',
  'vencimento',
  'total_centavos',
  'pago_centavos',
  'restante_centavos',
  'formas_de_pagamento',
] as const

/**
 * Exportação financeira para planilhas.
 *
 * O CSV é montado a partir do DTO já filtrado e autorizado pela rota. Não há
 * uma segunda leitura no navegador, nem inclusão de CPF, notas ou dados
 * clínicos. O separador é `;`, que abre corretamente no Excel em pt-BR, e os
 * valores monetários permanecem em centavos para não perder precisão.
 */
export function buildFinanceCsv({
  invoices,
  payables,
  periodLabel,
}: FinanceCsvInput): string {
  const rows = [
    columns,
    ...invoices.map((invoice) => [
      periodLabel,
      'Cobrança',
      invoice.number === null ? invoice.id : String(invoice.number),
      invoice.items.map((item) => item.description).join(' | '),
      invoice.patientName,
      invoice.status,
      invoice.createdAt,
      invoice.dueDate ?? '',
      String(invoice.totalCents),
      String(invoice.paidCents),
      String(invoice.remainingCents),
      invoice.payments.map((payment) => payment.method).join(' | '),
    ]),
    ...payables.map((payable) => [
      periodLabel,
      'Conta a pagar',
      payable.id,
      payable.description,
      payable.supplier ?? '',
      payable.status,
      '',
      payable.dueDate,
      String(payable.amountCents),
      String(payable.paidAmountCents),
      String(Math.max(payable.amountCents - payable.paidAmountCents, 0)),
      payable.method ?? '',
    ]),
  ]

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\n')}\n`
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`
}
