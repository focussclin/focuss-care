import { z } from 'zod'

export const INVOICE_SEARCH_LIMIT = 8
export const INVOICE_SEARCH_MIN_LENGTH = 2

export const invoiceSearchMessages = {
  queryTooShort: 'Digite pelo menos dois caracteres para buscar.',
  forbidden: 'Você não tem permissão para consultar o financeiro.',
  unavailable: 'Não foi possível buscar cobranças agora.',
} as const

export const searchInvoicesSchema = z.object({
  query: z
    .string()
    .trim()
    .min(INVOICE_SEARCH_MIN_LENGTH, invoiceSearchMessages.queryTooShort)
    .max(80, invoiceSearchMessages.unavailable),
})

export type SearchInvoicesInput = z.infer<typeof searchInvoicesSchema>

export interface InvoiceSearchDto {
  id: string
  patientName: string
  totalCents: number
  paidCents: number
  status: string
  createdAt: string
}
