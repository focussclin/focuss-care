// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FormDto } from '../schemas/form.schema'
import { FormResponseScreen } from './FormResponseScreen'

const form: FormDto = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Pré-atendimento',
  description: 'Antes da consulta',
  type: 'intake',
  status: 'published',
  version: 1,
  fields: [
    {
      id: 'field-name',
      label: 'Nome completo',
      type: 'text',
      required: true,
      helpText: null,
      options: [],
    },
  ],
  createdAt: '2026-08-09T10:00:00.000Z',
  updatedAt: '2026-08-09T10:00:00.000Z',
}

afterEach(cleanup)

describe('FormResponseScreen', () => {
  it('salva um rascunho vinculado ao paciente selecionado', async () => {
    const onSave = vi.fn().mockResolvedValue({
      error: null,
      response: {
        id: 'response-1',
        formId: form.id,
        patientId: 'patient-1',
        status: 'draft',
        answers: { 'field-name': 'Maria Silva' },
        submittedAt: null,
        createdAt: '2026-08-09T10:00:00.000Z',
        updatedAt: '2026-08-09T10:00:00.000Z',
      },
    })

    render(
      <FormResponseScreen
        form={form}
        patients={[{ id: 'patient-1', name: 'Maria Silva' }]}
        onSave={onSave}
        isLive
      />,
    )

    fireEvent.change(screen.getByLabelText('Paciente'), {
      target: { value: 'patient-1' },
    })
    fireEvent.change(screen.getByLabelText(/1\. Nome completo/), {
      target: { value: 'Maria Silva' },
    })
    fireEvent.click(screen.getByRole('button', { name: /salvar rascunho/i }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      formId: form.id,
      patientId: 'patient-1',
      status: 'draft',
      answers: { 'field-name': 'Maria Silva' },
    })))
    expect(await screen.findByText(/rascunho salvo/i)).toBeTruthy()
  })

  it('não envia sem selecionar paciente', () => {
    const onSave = vi.fn()

    render(<FormResponseScreen form={form} patients={[]} onSave={onSave} isLive />)
    fireEvent.click(screen.getByRole('button', { name: /enviar resposta/i }))

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})
