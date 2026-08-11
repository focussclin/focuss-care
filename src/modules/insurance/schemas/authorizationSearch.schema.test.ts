import { describe, expect, it } from 'vitest'

import {
  AUTHORIZATION_SEARCH_MIN_LENGTH,
  authorizationSearchMessages,
  searchAuthorizationsSchema,
} from './authorizationSearch.schema'

describe('entrada da busca de guia', () => {
  it('aceita o número da operadora', () => {
    const parsed = searchAuthorizationsSchema.safeParse({ query: '881234' })

    expect(parsed.success).toBe(true)
  })

  it('espaço em volta não conta como caractere digitado', () => {
    // "  a  " tem cinco caracteres e uma letra: sem o `trim` antes do `min`, uma
    // letra sozinha viraria consulta com `%a%` — a base inteira.
    const parsed = searchAuthorizationsSchema.safeParse({ query: '  a  ' })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues[0].message).toBe(
        authorizationSearchMessages.queryTooShort,
      )
    }
  })

  it('o mínimo é o mesmo das outras buscas da paleta', () => {
    expect(AUTHORIZATION_SEARCH_MIN_LENGTH).toBe(2)
  })

  it('termo longo demais não vira consulta', () => {
    const parsed = searchAuthorizationsSchema.safeParse({
      query: 'a'.repeat(81),
    })

    expect(parsed.success).toBe(false)
  })

  it('o termo chega ao handler sem espaço nas pontas', () => {
    const parsed = searchAuthorizationsSchema.safeParse({ query: ' 881234 ' })

    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.query).toBe('881234')
  })
})
