import { describe, expect, it } from 'vitest'

import type { Form } from '../domain/Form'
import { validateFormResponse } from './formResponseValidation'

const form: Form = {
  id: 'form-1',
  name: 'Pré-atendimento',
  description: null,
  type: 'intake',
  status: 'published',
  version: 1,
  fields: [
    {
      id: 'name',
      label: 'Nome completo',
      type: 'text',
      required: true,
      helpText: null,
      options: [],
    },
    {
      id: 'notes',
      label: 'Observações',
      type: 'textarea',
      required: false,
      helpText: null,
      options: [],
    },
  ],
  createdAt: new Date('2026-08-09T10:00:00.000Z'),
  updatedAt: new Date('2026-08-09T10:00:00.000Z'),
}

describe('validateFormResponse', () => {
  it('exige campos obrigatórios apenas no envio', () => {
    expect(validateFormResponse(form, {}, 'draft')).toBeNull()
    expect(validateFormResponse(form, {}, 'submitted')).toContain('obrigatórios')
    expect(validateFormResponse(form, { name: 'Maria' }, 'submitted')).toBeNull()
  })

  it('recusa respostas para campos que não pertencem ao modelo', () => {
    expect(validateFormResponse(form, { other: 'valor' }, 'draft')).toContain('alterado')
  })

  it('não libera envio de assinatura ou upload sem integração', () => {
    expect(
      validateFormResponse(
        {
          ...form,
          fields: [
            ...form.fields,
            {
              id: 'signature',
              label: 'Assinatura',
              type: 'signature',
              required: false,
              helpText: null,
              options: [],
            },
          ],
        },
        { name: 'Maria' },
        'submitted',
      ),
    ).toContain('assinatura')
  })
})
