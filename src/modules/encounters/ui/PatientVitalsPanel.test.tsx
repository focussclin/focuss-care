// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { VitalsEntryDto } from '../schemas/vitals.schema'
import { PatientVitalsPanel } from './PatientVitalsPanel'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const PATIENT = '22222222-2222-4222-8222-222222222222'

const entry: VitalsEntryDto = {
  id: '11111111-1111-4111-8111-111111111111',
  patientId: PATIENT,
  encounterId: null,
  measuredAt: '2026-08-10T13:00:00.000Z',
  weightKg: 70,
  heightCm: 175,
  systolicBp: 120,
  diastolicBp: 80,
  heartRate: 72,
  respiratoryRate: null,
  temperatureC: 36.5,
  spo2: 97,
  glucoseMgdl: null,
  notes: null,
}

afterEach(cleanup)

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof PatientVitalsPanel>> = {},
) {
  return render(
    <PatientVitalsPanel
      patientId={PATIENT}
      entries={[entry]}
      onRecord={vi.fn().mockResolvedValue(null)}
      canRecord
      isLive
      {...overrides}
    />,
  )
}

describe('a tela mostra a medida, e não um julgamento', () => {
  it('exibe os valores com unidade', () => {
    renderPanel()

    expect(screen.getByText(/PA 120\/80 mmHg/)).toBeTruthy()
    expect(screen.getByText(/FC 72 bpm/)).toBeTruthy()
    expect(screen.getByText(/SpO₂ 97%/)).toBeTruthy()
  })

  it('não classifica nada como normal ou alterado', () => {
    /*
     * Faixa de referência depende de idade, condição e diretriz. Um número
     * vermelho aqui seria um julgamento clínico do produto — e um que pareceria
     * oficial.
     */
    renderPanel({
      entries: [{ ...entry, systolicBp: 180, diastolicBp: 110, spo2: 84 }],
    })

    expect(screen.queryByText(/normal|alterad|elevad|crítico|grave/i)).toBeNull()
    expect(screen.getByText(/a leitura é de quem atende/i)).toBeTruthy()
  })

  it('calcula o IMC, sem faixa', () => {
    // 70 kg e 175 cm → 22,9. "Sobrepeso" não vale para criança nem atleta.
    renderPanel()

    expect(screen.getByText(/IMC 22,9/)).toBeTruthy()
    expect(screen.queryByText(/sobrepeso|obesidade|eutrofia/i)).toBeNull()
  })

  it('campo não medido não vira zero nem travessão', () => {
    /*
     * Um zero onde ninguém mediu é medida inventada; um travessão para cada um
     * dos nove campos afogaria os dois que foram preenchidos.
     */
    renderPanel({ entries: [{ ...entry, glucoseMgdl: null, respiratoryRate: null }] })

    expect(screen.queryByText(/Glicemia/)).toBeNull()
    expect(screen.queryByText(/FR /)).toBeNull()
  })

  it('vazio não afirma que está tudo bem', () => {
    renderPanel({ entries: [] })

    expect(screen.getByText(/Nenhuma aferição registrada/i)).toBeTruthy()
  })

  it('a mais recente vem primeiro', () => {
    renderPanel({
      entries: [
        { ...entry, id: 'velha', measuredAt: '2026-01-01T13:00:00.000Z', spo2: 90 },
        { ...entry, id: 'nova', measuredAt: '2026-08-10T13:00:00.000Z', spo2: 98 },
      ],
    })

    const items = screen.getAllByRole('listitem').map((item) => item.textContent ?? '')
    expect(items[0]).toContain('98%')
  })
})

describe('registro', () => {
  it('envia o que foi preenchido', async () => {
    const onRecord = vi.fn().mockResolvedValue(null)
    renderPanel({ entries: [], onRecord })

    fireEvent.click(screen.getByRole('button', { name: /registrar aferição/i }))
    fireEvent.change(screen.getByLabelText('Pressão sistólica (mmHg)'), {
      target: { value: '130' },
    })
    fireEvent.change(screen.getByLabelText('Pressão diastólica (mmHg)'), {
      target: { value: '85' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar aferição' }))

    await waitFor(() =>
      expect(onRecord).toHaveBeenCalledWith(
        PATIENT,
        expect.objectContaining({ systolicBp: '130', diastolicBp: '85' }),
      ),
    )
  })

  it('a data começa preenchida com o agora, e é editável', () => {
    /*
     * Quem afere registra na hora; quem transcreve papel precisa recuar. Campo
     * vazio faria a maioria digitar data e hora em toda aferição.
     */
    renderPanel({ entries: [] })

    fireEvent.click(screen.getByRole('button', { name: /registrar aferição/i }))
    const field = screen.getByLabelText('Data e hora da aferição') as HTMLInputElement

    expect(field.value).not.toBe('')
    fireEvent.change(field, { target: { value: '2026-08-01T09:00' } })
    expect(field.value).toBe('2026-08-01T09:00')
  })

  it('a recusa do servidor aparece dentro do modal', async () => {
    const onRecord = vi.fn().mockResolvedValue('Informe ao menos uma medida.')
    renderPanel({ entries: [], onRecord })

    fireEvent.click(screen.getByRole('button', { name: /registrar aferição/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar aferição' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/ao menos uma medida/i),
    )
  })
})

describe('não existe editar nem excluir', () => {
  it('o histórico é somente acrescentado', () => {
    /*
     * `vitals` não tem `updated_at` nem `deleted_at`: a medida é de um
     * instante, e corrigir é registrar de novo.
     */
    renderPanel()

    expect(screen.queryByRole('button', { name: /editar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /excluir|remover|apagar/i })).toBeNull()
    expect(screen.getByText(/não há edição/i)).toBeTruthy()
  })
})

describe('permissão e falhas', () => {
  it('sem `encounter.write`, não registra', () => {
    renderPanel({ canRecord: false })

    expect(screen.getByRole('button', { name: /registrar aferição/i }).hasAttribute('disabled')).toBe(true)
  })

  it('modo demonstração não fabrica aferição', () => {
    // Um "PA 120/80" inventado faria alguém concluir que mediram.
    renderPanel({ entries: [], isLive: false })

    expect(screen.getByText(/modo demonstração/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /registrar aferição/i }).hasAttribute('disabled')).toBe(true)
  })

  it('falha de leitura aparece e bloqueia o registro', () => {
    renderPanel({ entries: [], loadError: 'Não foi possível falar com o servidor agora.' })

    expect(screen.getByRole('alert').textContent).toContain('servidor')
    expect(screen.queryByText(/Nenhuma aferição registrada/i)).toBeNull()
    expect(screen.getByRole('button', { name: /registrar aferição/i }).hasAttribute('disabled')).toBe(true)
  })
})
