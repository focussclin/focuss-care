import { describe, expect, it } from 'vitest'

import {
  invoiceSearchMessages,
  searchInvoicesSchema,
} from './invoiceSearch.schema'

describe('schema de busca de cobranças', () => {
  it('aceita um nome com dois ou mais caracteres', () => {
    expect(searchInvoicesSchema.parse({ query: 'Maria' })).toEqual({
      query: 'Maria',
    })
  })

  it('recusa termo curto antes de consultar o financeiro', () => {
    const result = searchInvoicesSchema.safeParse({ query: 'M' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        invoiceSearchMessages.queryTooShort,
      )
    }
  })
})
