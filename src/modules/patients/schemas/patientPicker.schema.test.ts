import { describe, expect, it } from 'vitest'

import {
  patientPickerMessages,
  PICKER_MIN_QUERY_LENGTH,
  PICKER_RESULT_LIMIT,
  searchPatientsSchema,
} from './patientPicker.schema'

/**
 * O contrato do seletor de paciente.
 *
 * O schema e a unica coisa entre o campo de texto e uma consulta no banco de uma
 * clinica inteira. O que se verifica aqui:
 *
 *  - termo curto NAO chega ao servidor (o seletor tem 8 vagas; 1 caractere
 *    devolveria os 8 primeiros da clinica e nada mais);
 *  - o termo e higienizado pelo mesmo caminho da listagem, entao curinga de
 *    `LIKE` e gramatica do PostgREST nao atravessam;
 *  - nenhum campo alem de `query` sobrevive — em especial `clinicId`.
 */

function parse(input: unknown) {
  return searchPatientsSchema.safeParse(input)
}

describe('termo aceito', () => {
  it('passa o termo limpo adiante', () => {
    const result = parse({ query: 'maria' })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.query).toBe('maria')
  })

  it('tira o espaco das pontas, que o usuario nao quis digitar', () => {
    const result = parse({ query: '  ana  ' })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.query).toBe('ana')
  })

  it('aceita exatamente o minimo', () => {
    const term = 'a'.repeat(PICKER_MIN_QUERY_LENGTH)
    const result = parse({ query: term })

    expect(result.success).toBe(true)
  })
})

describe('termo recusado', () => {
  it.each([
    ['vazio', ''],
    ['so espaco', '   '],
    ['um caractere', 'a'],
  ])('recusa %s antes de chegar ao banco', (_label, query) => {
    const result = parse({ query })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        patientPickerMessages.queryTooShort,
      )
    }
  })

  it('recusa termo que nao e string', () => {
    expect(parse({ query: 42 }).success).toBe(false)
    expect(parse({ query: null }).success).toBe(false)
    expect(parse({}).success).toBe(false)
  })

  it('recusa termo absurdamente longo', () => {
    expect(parse({ query: 'a'.repeat(5_000) }).success).toBe(false)
  })
})

describe('o que nao atravessa a fronteira', () => {
  it('descarta clinicId mandado pelo cliente', () => {
    const result = parse({
      query: 'maria',
      clinicId: 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ query: 'maria' })
      expect(JSON.stringify(result.data)).not.toContain('b4b7c0f2')
    }
  })

  it('descarta limite mandado pelo cliente', () => {
    const result = parse({ query: 'maria', limit: 10_000 })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toEqual({ query: 'maria' })
  })

  it('remove curinga de LIKE em vez de escapar', () => {
    const result = parse({ query: 'ma%ri_a' })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.query).toBe('maria')
  })

  it('neutraliza a gramatica do PostgREST', () => {
    const result = parse({ query: 'maria,or(id.eq.1)' })

    expect(result.success).toBe(true)
    if (result.success) {
      for (const char of [',', '(', ')', '"', "'", '\\', '/']) {
        expect(result.data.query).not.toContain(char)
      }
    }
  })

  it('recusa termo que so tinha curinga — nao vira busca vazia', () => {
    const result = parse({ query: '%%%' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        patientPickerMessages.queryTooShort,
      )
    }
  })
})

describe('limite do seletor', () => {
  it('e curto de proposito — isto e um seletor, nao uma listagem', () => {
    expect(PICKER_RESULT_LIMIT).toBeLessThanOrEqual(10)
    expect(PICKER_RESULT_LIMIT).toBeGreaterThan(0)
  })
})
