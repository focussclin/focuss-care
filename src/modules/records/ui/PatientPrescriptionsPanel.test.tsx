// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PrescriptionDto } from '../schemas/prescription.schema'
import { PatientPrescriptionsPanel } from './PatientPrescriptionsPanel'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const PATIENT = '22222222-2222-4222-8222-222222222222'

const prescription: PrescriptionDto = {
  id: '11111111-1111-4111-8111-111111111111',
  patientId: PATIENT,
  encounterId: null,
  authorName: 'Dra. Helena',
  issuedAt: '2026-08-10T13:00:00.000Z',
  validUntil: null,
  signedAt: null,
  externalUrl: null,
  items: [
    {
      id: 'i1',
      drugName: 'Amoxicilina 500 mg',
      dosage: '1 comprimido',
      route: 'Via oral',
      frequency: '8 em 8 horas',
      duration: '7 dias',
      quantity: '1 caixa',
      instructions: 'Após as refeições.',
      sortOrder: 0,
    },
  ],
}

afterEach(cleanup)

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof PatientPrescriptionsPanel>> = {},
) {
  return render(
    <PatientPrescriptionsPanel
      patientId={PATIENT}
      prescriptions={[prescription]}
      onCreate={vi.fn().mockResolvedValue(null)}
      canPrescribe
      isProfessional
      isLive
      {...overrides}
    />,
  )
}

/**
 * O que esta tela promete é exatamente o que ela faz.
 */
describe('nada de assinatura, emissão ou impressão', () => {
  it('o aviso explica o que não existe', () => {
    renderPanel()

    expect(screen.getByText(/sem assinatura digital e sem emissão oficial/i)).toBeTruthy()
  })

  it('não há botão de assinar, imprimir ou gerar PDF', () => {
    /*
     * Um botão que parecesse assinar seria a mentira mais cara que este produto
     * poderia contar.
     */
    renderPanel()

    expect(
      screen.queryByRole('button', { name: /assinar|imprimir|pdf|emitir|enviar/i }),
    ).toBeNull()
  })

  it('não existe editar nem excluir prescrição', () => {
    // As duas tabelas são append-only: prescrição corrigida é prescrição nova.
    renderPanel()

    expect(screen.queryByRole('button', { name: /editar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /excluir prescrição/i })).toBeNull()
    expect(screen.getByText(/não há edição/i)).toBeTruthy()
  })
})

describe('a lista mostra o que foi escrito', () => {
  it('exibe os campos do item como texto', () => {
    renderPanel()

    expect(screen.getByText(/Amoxicilina 500 mg · 1 comprimido · Via oral/)).toBeTruthy()
    expect(screen.getByText('Após as refeições.')).toBeTruthy()
  })

  it('campo em branco some, e não vira travessão', () => {
    renderPanel({
      prescriptions: [
        {
          ...prescription,
          items: [
            {
              ...prescription.items[0],
              dosage: null,
              route: null,
              frequency: null,
              duration: null,
              quantity: null,
              instructions: null,
            },
          ],
        },
      ],
    })

    /*
     * A asserção mira a LINHA do item: procurar travessão na tela inteira
     * casaria com o travessão do próprio texto do cabeçalho.
     */
    const line = screen.getByText(/Amoxicilina 500 mg/)
    expect(line.textContent).toBe('Amoxicilina 500 mg')
  })

  it('mostra quem prescreveu', () => {
    renderPanel()

    expect(screen.getByText('Dra. Helena')).toBeTruthy()
  })

  it('validade vencida é fato, não conduta', () => {
    /*
     * O selo diz que a data passou. Não diz para suspender: uma receita vencida
     * pode estar sendo seguida com razão.
     */
    renderPanel({ prescriptions: [{ ...prescription, validUntil: '2020-01-01T00:00:00.000Z' }] })

    expect(screen.getByText('Validade vencida')).toBeTruthy()
    expect(screen.queryByText(/suspend|interromp|renove/i)).toBeNull()
  })

  it('sem validade não afirma vencimento', () => {
    renderPanel()

    expect(screen.queryByText('Validade vencida')).toBeNull()
  })

  it('prescrição sem item é sinalizada, e não parece completa', () => {
    /*
     * Sem função no banco, cabeçalho e itens são dois inserts; uma falha no
     * segundo deixaria a receita vazia. Ela aparece como vazia.
     */
    renderPanel({ prescriptions: [{ ...prescription, items: [] }] })

    expect(screen.getByText(/está sem itens/i)).toBeTruthy()
  })

  it('vazio não afirma que não houve prescrição alguma', () => {
    renderPanel({ prescriptions: [] })

    expect(screen.getByText(/Nenhuma prescrição registrada/i)).toBeTruthy()
  })
})

describe('registro', () => {
  it('envia os itens preenchidos', async () => {
    const onCreate = vi.fn().mockResolvedValue(null)
    renderPanel({ prescriptions: [], onCreate })

    fireEvent.click(screen.getByRole('button', { name: /nova prescrição/i }))
    fireEvent.change(screen.getByLabelText('Medicamento (item 1)'), {
      target: { value: 'Dipirona 500 mg' },
    })
    fireEvent.change(screen.getByLabelText('Dose (item 1)'), {
      target: { value: '1 comprimido' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar prescrição' }))

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        PATIENT,
        expect.objectContaining({
          items: [expect.objectContaining({ drugName: 'Dipirona 500 mg' })],
        }),
      ),
    )
  })

  it('linhas em branco são descartadas antes de enviar', async () => {
    /*
     * O formulário ganha uma linha a cada "adicionar"; exigir que a pessoa
     * apague a última seria atrito sem motivo.
     */
    const onCreate = vi.fn().mockResolvedValue(null)
    renderPanel({ prescriptions: [], onCreate })

    fireEvent.click(screen.getByRole('button', { name: /nova prescrição/i }))
    fireEvent.change(screen.getByLabelText('Medicamento (item 1)'), {
      target: { value: 'Dipirona' },
    })
    fireEvent.click(screen.getByRole('button', { name: /adicionar item/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar prescrição' }))

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        PATIENT,
        expect.objectContaining({ items: [expect.objectContaining({ drugName: 'Dipirona' })] }),
      ),
    )
  })

  it('prescrição sem nenhum medicamento não chega ao servidor', async () => {
    const onCreate = vi.fn().mockResolvedValue(null)
    renderPanel({ prescriptions: [], onCreate })

    fireEvent.click(screen.getByRole('button', { name: /nova prescrição/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar prescrição' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('o formulário avisa que não confere dose', () => {
    renderPanel({ prescriptions: [] })

    fireEvent.click(screen.getByRole('button', { name: /nova prescrição/i }))

    expect(screen.getByText(/não confere dose, via nem interação/i)).toBeTruthy()
  })

  it('a recusa do servidor aparece dentro do modal', async () => {
    const onCreate = vi.fn().mockResolvedValue('Este paciente não está mais disponível.')
    renderPanel({ prescriptions: [], onCreate })

    fireEvent.click(screen.getByRole('button', { name: /nova prescrição/i }))
    fireEvent.change(screen.getByLabelText('Medicamento (item 1)'), {
      target: { value: 'Dipirona' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar prescrição' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/não está mais disponível/i),
    )
  })
})

describe('permissão e estados', () => {
  it('sem `record.write`, não prescreve', () => {
    renderPanel({ canPrescribe: false })

    expect(screen.getByRole('button', { name: /nova prescrição/i }).hasAttribute('disabled')).toBe(true)
  })

  it('com papel mas SEM cadastro profissional, a tela diz o que fazer', () => {
    /*
     * Um botão desabilitado sem explicação deixaria a pessoa procurando o
     * problema no lugar errado.
     */
    renderPanel({ isProfessional: false })

    expect(screen.getByRole('status').textContent).toMatch(/cadastro de profissional/i)
    expect(screen.getByRole('button', { name: /nova prescrição/i }).hasAttribute('disabled')).toBe(true)
  })

  it('modo demonstração não fabrica prescrição', () => {
    // Um medicamento inventado na ficha é a pior invenção possível aqui.
    renderPanel({ prescriptions: [], isLive: false })

    expect(screen.getByText(/modo demonstração/i)).toBeTruthy()
  })

  it('falha de leitura aparece e bloqueia o registro', () => {
    renderPanel({ prescriptions: [], loadError: 'Não foi possível falar com o servidor agora.' })

    expect(screen.getByRole('alert').textContent).toContain('servidor')
    expect(screen.queryByText(/Nenhuma prescrição registrada/i)).toBeNull()
    expect(screen.getByRole('button', { name: /nova prescrição/i }).hasAttribute('disabled')).toBe(true)
  })
})
