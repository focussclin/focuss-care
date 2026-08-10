'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { billingRepositoryFor } from '../infrastructure/repository'
import {
  INVOICE_SEARCH_LIMIT,
  invoiceSearchMessages,
  searchInvoicesSchema,
  type InvoiceSearchDto,
  type SearchInvoicesInput,
} from '../schemas/invoiceSearch.schema'

type Field = 'query'

const runSearchInvoices = createAction<
  SearchInvoicesInput,
  readonly InvoiceSearchDto[],
  Field
>({
  name: 'invoice.search',
  schema: searchInvoicesSchema,
  roles: rolesWith('invoice.read'),
  messages: {
    forbidden: invoiceSearchMessages.forbidden,
    validation: invoiceSearchMessages.queryTooShort,
    unavailable: invoiceSearchMessages.unavailable,
    unexpected: invoiceSearchMessages.unavailable,
  },

  handler: async (input, context) => {
    try {
      const invoices = await billingRepositoryFor(
        context.supabase,
      ).searchInvoicesByPatientName(
        context.clinicId,
        input.query,
        INVOICE_SEARCH_LIMIT,
      )

      return ok<readonly InvoiceSearchDto[]>(
        invoices.map((invoice) => ({
          id: invoice.id,
          patientName: invoice.patientName,
          totalCents: invoice.totalCents,
          paidCents: invoice.paidCents,
          status: invoice.status,
          createdAt: invoice.createdAt.toISOString(),
        })),
      )
    } catch (cause) {
      console.error('[invoice.search] leitura recusada', {
        kind: cause instanceof Error ? cause.name : typeof cause,
      })
      return err<Field>('unavailable', invoiceSearchMessages.unavailable)
    }
  },
})

export async function searchInvoicesAction(
  rawInput: unknown,
): Promise<ActionResult<readonly InvoiceSearchDto[], Field>> {
  return runSearchInvoices(rawInput)
}
