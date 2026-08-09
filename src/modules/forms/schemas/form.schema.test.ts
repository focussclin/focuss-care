import { describe, expect, it } from 'vitest'

import { createFormSchema } from './form.schema'

describe('form.schema', () => {
  it('recusa um modelo sem campos', () => {
    const result = createFormSchema.safeParse({
      name: 'Pré-atendimento',
      description: '',
      type: 'intake',
      status: 'draft',
      fields: [],
    })

    expect(result.success).toBe(false)
  })

  it('normaliza descrição, ajuda e opções do builder', () => {
    const result = createFormSchema.safeParse({
      name: 'Consentimento',
      description: '  Termos iniciais  ',
      type: 'consent',
      status: 'published',
      fields: [
        {
          id: 'field-1',
          label: 'Você concorda?',
          type: 'radio',
          required: true,
          helpText: '  Leia antes de responder  ',
          options: [' Sim ', 'Não'],
        },
      ],
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.description).toBe('Termos iniciais')
    expect(result.data.fields[0].helpText).toBe('Leia antes de responder')
    expect(result.data.fields[0].options).toEqual(['Sim', 'Não'])
  })
})
