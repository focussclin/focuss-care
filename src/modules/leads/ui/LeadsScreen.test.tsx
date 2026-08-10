// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LeadDto } from '../schemas/lead.schema'
import { LeadsScreen } from './LeadsScreen'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push }),
}))

const leads: LeadDto[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Maria Silva',
    phone: '11900000000',
    email: 'maria@example.com',
    source: 'Instagram',
    campaign: 'Avaliação',
    interest: 'Dermatologia',
    stage: 'new',
    potentialValueCents: 45000,
    nextActionAt: '2026-08-10T23:59:59.999Z',
    notes: 'Quer atendimento à tarde.',
    assignedTo: { id: '22222222-2222-4222-8222-222222222222', name: 'Ana Costa' },
    convertedPatientId: null,
    createdAt: '2026-08-09T10:00:00.000Z',
    updatedAt: '2026-08-09T10:00:00.000Z',
  },
]

afterEach(cleanup)

/*
 * `push` é declarado fora do `vi.mock` e sobrevive entre os testes — sem
 * limpá-lo, "não navega" veria a navegação de um teste anterior e falharia
 * acusando o código certo.
 */
beforeEach(() => push.mockClear())

function renderScreen(overrides: Partial<React.ComponentProps<typeof LeadsScreen>> = {}) {
  return render(
    <LeadsScreen
      leads={leads}
      assignees={[{ id: '22222222-2222-4222-8222-222222222222', name: 'Ana Costa' }]}
      onSubmit={vi.fn().mockResolvedValue(null)}
      onMove={vi.fn().mockResolvedValue(null)}
      onConvert={vi
        .fn()
        .mockResolvedValue({ ok: true, patientHref: '/pacientes/p-1' })}
      isLive
      {...overrides}
    />,
  )
}

describe('LeadsScreen', () => {
  it('renderiza o pipeline e os dados essenciais do lead', () => {
    renderScreen()

    expect(screen.getByRole('heading', { name: 'CRM e Leads' })).toBeTruthy()
    expect(screen.getByText('Maria Silva')).toBeTruthy()
    expect(screen.getByText('R$ 450,00')).toBeTruthy()
    expect(screen.getByText('Instagram')).toBeTruthy()
  })

  it('filtra por busca sem alterar o conjunto original', () => {
    renderScreen()

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'telefone inexistente' } })

    expect(screen.getByText('Nenhum lead com esses filtros.')).toBeTruthy()
    expect(screen.queryByText('Maria Silva')).toBeNull()
  })

  it('não oferece gravação enquanto a migration está pendente', () => {
    renderScreen({ leads: [], schemaPending: true })

    expect(screen.getByRole('status').textContent).toMatch(/migration/i)
    expect(screen.getByRole('button', { name: /novo lead/i }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: /cadastrar primeiro lead/i }).hasAttribute('disabled')).toBe(true)
  })

  it('envia a criação e move um lead pelo seletor do cartão', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null)
    const onMove = vi.fn().mockResolvedValue(null)
    renderScreen({ leads: [], onSubmit, onMove })

    fireEvent.click(screen.getByRole('button', { name: /novo lead/i }))
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '  João Lima ' } })
    fireEvent.change(screen.getByLabelText('Origem'), { target: { value: 'Indicação' } })
    fireEvent.change(screen.getByLabelText('Valor potencial (R$)'), { target: { value: '120.50' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar lead/i }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'João Lima',
          source: 'Indicação',
          potentialValueCents: 12050,
          stage: 'new',
        }),
        null,
      ),
    )

    cleanup()
    renderScreen({ onMove })
    fireEvent.change(screen.getByLabelText('Mover Maria Silva'), { target: { value: 'contacted' } })

    await waitFor(() => expect(onMove).toHaveBeenCalledWith(leads[0].id, 'contacted'))
  })
})

/**
 * A conversão em paciente — a única ação desta tela que cria dado clínico.
 *
 * Os três estados existem para que a tela nunca ofereça o que não pode
 * cumprir. O mais importante é o primeiro: um botão "converter" num lead já
 * convertido criaria a **segunda ficha da mesma pessoa**, que é o pior desfecho
 * possível num cadastro de saúde — e ninguém percebe até a recepção achar duas
 * Marias com o mesmo telefone.
 */
describe('conversão em paciente', () => {
  const convertido: LeadDto = {
    ...leads[0],
    id: 'lead-convertido',
    name: 'Joana Convertida',
    convertedPatientId: 'patient-9',
  }

  it('cria o paciente e leva até a ficha nova', async () => {
    /*
     * `push`, e não `refresh`: "convertido" sem mostrar onde o paciente foi
     * parar faria a recepção procurá-lo na lista para confirmar que existe.
     */
    const onConvert = vi
      .fn()
      .mockResolvedValue({ ok: true, patientHref: '/pacientes/p-1' })

    renderScreen({ onConvert })

    fireEvent.click(screen.getByRole('button', { name: /converter em paciente/i }))

    await waitFor(() => expect(onConvert).toHaveBeenCalledWith(leads[0].id))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/pacientes/p-1'))
  })

  it('lead JÁ convertido não oferece converter, e sim o link da ficha', () => {
    renderScreen({ leads: [convertido] })

    expect(
      screen.queryByRole('button', { name: /converter em paciente/i }),
    ).toBeNull()

    const link = screen.getByRole('link', { name: /ver ficha do paciente/i })

    expect(link.getAttribute('href')).toBe('/pacientes/patient-9')
  })

  it('lead perdido não oferece conversão', () => {
    // A etapa já diz que não há o que converter; um botão ali convidaria a
    // criar ficha de quem desistiu.
    renderScreen({ leads: [{ ...leads[0], stage: 'lost' }] })

    expect(
      screen.queryByRole('button', { name: /converter em paciente/i }),
    ).toBeNull()
  })

  it('sem banco não há botão — nem desabilitado', () => {
    /*
     * Botão desabilitado que nunca habilita é promessa vazia. A conversão cria
     * ficha clínica e a demonstração não cria: melhor não oferecer.
     */
    renderScreen({ isLive: false })

    expect(
      screen.queryByRole('button', { name: /converter em paciente/i }),
    ).toBeNull()
  })

  it('com a migration pendente também não há botão', () => {
    renderScreen({ schemaPending: true })

    expect(
      screen.queryByRole('button', { name: /converter em paciente/i }),
    ).toBeNull()
  })

  it('a recusa aparece na tela, e não navega', async () => {
    const onConvert = vi
      .fn()
      .mockResolvedValue({ ok: false, message: 'Este lead já virou paciente.' })

    renderScreen({ onConvert })

    fireEvent.click(screen.getByRole('button', { name: /converter em paciente/i }))

    await waitFor(() =>
      expect(screen.getByText('Este lead já virou paciente.')).toBeTruthy(),
    )
    expect(push).not.toHaveBeenCalled()
  })
})
