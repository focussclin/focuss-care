import { describe, expect, it } from 'vitest'

import {
  appointmentSearchMessages,
  searchAppointmentsSchema,
} from './appointmentSearch.schema'

describe('schema de busca de agendamentos', () => {
  it('aceita um termo com dois ou mais caracteres', () => {
    expect(searchAppointmentsSchema.parse({ query: 'Maria' })).toEqual({
      query: 'Maria',
    })
  })

  it('recusa termo curto antes de consultar o banco', () => {
    const result = searchAppointmentsSchema.safeParse({ query: 'M' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        appointmentSearchMessages.queryTooShort,
      )
    }
  })
})
