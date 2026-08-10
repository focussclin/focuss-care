// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AllergyDto } from '../schemas/allergy.schema'
import { PatientAllergiesPanel } from './PatientAllergiesPanel'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const PATIENT = '22222222-2222-4222-8222-222222222222'

const allergy: AllergyDto = {
  id: '11111111-1111-4111-8111-111111111111',
  patientId: PATIENT,
  substance: 'Dipirona',
  reaction: 'Urticária',
  isActive: true,
  recordedAt: '2026-08-09T10:00:00.000Z',
}

afterEach(cleanup)

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof PatientAllergiesPanel>> = {},
) {
  return render(
    <PatientAllergiesPanel
      patientId={PATIENT}
      allergies={[allergy]}
      onSubmit={vi.fn().mockResolvedValue(null)}
      onSetActive={vi.fn().mockResolvedValue(null)}
      canManage
      isLive
      {...overrides}
    />,
  )
}

describe('o painel diz o que sabe, e o que não sabe', () => {
  it('a gravidade não aparece, e a ausência é explicada', () => {
    /*
     * `allergies.severity` guarda um número e a escala não pôde ser verificada.
     * Mostrar "2" sem saber se vai até 3 ou até 5, nem para que lado cresce, é
     * pior que não mostrar: quem lê assume a escala que conhece.
     */
    renderPanel()

    expect(screen.getByText(/gravidade não é registrada/i)).toBeTruthy()
    expect(screen.queryByText(/grave|moderada|leve/i)).toBeNull()
  })

  it('ficha vazia não afirma ausência de alergia', () => {
    /*
     * "Sem alergias" seria uma afirmação clínica que ninguém fez. A lista vazia
     * significa que ainda não perguntaram — e a diferença importa na hora de
     * prescrever.
     */
    renderPanel({ allergies: [] })

    expect(screen.getByText(/não significa ausência de alergia/i)).toBeTruthy()
  })

  it('conta as ativas no cabeçalho', () => {
    renderPanel({
      allergies: [allergy, { ...allergy, id: 'b', substance: 'Látex', isActive: false }],
    })

    expect(screen.getByText(/1 ativa\./i)).toBeTruthy()
  })

  it('descartada aparece como histórico, e não some', () => {
    renderPanel({ allergies: [{ ...allergy, isActive: false }] })

    expect(screen.getByText('Dipirona')).toBeTruthy()
    expect(screen.getByText('Descartada')).toBeTruthy()
  })

  it('ativas vêm antes das descartadas', () => {
    renderPanel({
      allergies: [
        { ...allergy, id: 'inativa', substance: 'Látex', isActive: false },
        { ...allergy, id: 'ativa', substance: 'Penicilina' },
      ],
    })

    const items = screen.getAllByRole('listitem').map((item) => item.textContent ?? '')
    expect(items[0]).toContain('Penicilina')
    expect(items[1]).toContain('Látex')
  })
})

describe('registro', () => {
  it('envia substância e reação', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null)
    renderPanel({ allergies: [], onSubmit })

    fireEvent.click(screen.getByRole('button', { name: /registrar alergia/i }))
    fireEvent.change(screen.getByLabelText('Substância'), { target: { value: '  Penicilina  ' } })
    fireEvent.change(screen.getByLabelText('Reação'), { target: { value: 'Edema de glote' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        PATIENT,
        { substance: 'Penicilina', reaction: 'Edema de glote' },
        null,
      ),
    )
  })

  it('substância vazia não chega ao servidor', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null)
    renderPanel({ allergies: [], onSubmit })

    fireEvent.click(screen.getByRole('button', { name: /registrar alergia/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('editar carrega o que está registrado e manda o id', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null)
    renderPanel({ onSubmit })

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    expect((screen.getByLabelText('Substância') as HTMLInputElement).value).toBe('Dipirona')

    fireEvent.change(screen.getByLabelText('Reação'), { target: { value: 'Choque' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        PATIENT,
        { substance: 'Dipirona', reaction: 'Choque' },
        allergy.id,
      ),
    )
  })

  it('a recusa do servidor aparece dentro do modal', async () => {
    /*
     * O modal fica aberto de propósito para a pessoa corrigir sem redigitar, e
     * o Radix marca o resto do documento com `aria-hidden` — mensagem no nível
     * da página ficaria atrás do overlay e fora da árvore de acessibilidade.
     */
    const onSubmit = vi.fn().mockResolvedValue('Esta substância já está registrada.')
    renderPanel({ onSubmit })

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/já está registrada/i))
  })
})

describe('descartar e reativar', () => {
  it('descartar manda o oposto do estado atual', async () => {
    const onSetActive = vi.fn().mockResolvedValue(null)
    renderPanel({ onSetActive })

    fireEvent.click(screen.getByRole('button', { name: /descartar/i }))

    await waitFor(() => expect(onSetActive).toHaveBeenCalledWith(allergy.id, false))
  })

  it('reativar existe para desfazer o descarte', async () => {
    const onSetActive = vi.fn().mockResolvedValue(null)
    renderPanel({ allergies: [{ ...allergy, isActive: false }], onSetActive })

    fireEvent.click(screen.getByRole('button', { name: /reativar/i }))

    await waitFor(() => expect(onSetActive).toHaveBeenCalledWith(allergy.id, true))
  })

  it('não existe excluir', () => {
    renderPanel()

    expect(screen.queryByRole('button', { name: /excluir|remover|apagar/i })).toBeNull()
  })
})

describe('permissão e falhas', () => {
  it('sem `record.write`, nada de escrever', () => {
    renderPanel({ canManage: false })

    expect(screen.queryByRole('button', { name: /editar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /descartar/i })).toBeNull()
    expect(screen.getByRole('button', { name: /registrar alergia/i }).hasAttribute('disabled')).toBe(true)
  })

  it('modo demonstração não fabrica alergia', () => {
    renderPanel({ allergies: [], isLive: false })

    expect(screen.getByText(/modo demonstração/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /registrar alergia/i }).hasAttribute('disabled')).toBe(true)
  })

  it('falha de leitura aparece e bloqueia a escrita', () => {
    // Lista vazia por erro não pode parecer "nenhuma alergia registrada".
    renderPanel({ allergies: [], loadError: 'Não foi possível falar com o servidor agora.' })

    expect(screen.getByRole('alert').textContent).toContain('servidor')
    expect(screen.queryByText(/não significa ausência/i)).toBeNull()
    expect(screen.getByRole('button', { name: /registrar alergia/i }).hasAttribute('disabled')).toBe(true)
  })
})
