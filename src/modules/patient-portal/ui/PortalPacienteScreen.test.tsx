// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { PortalPacienteScreen } from './PortalPacienteScreen'
import type { PortalPacienteScreenProps } from './PortalPacienteScreen'

/**
 * A tela do paciente — e o que ela diz em voz alta.
 *
 * O teste mais importante aqui é o do aviso sobre o prontuário. Quem abre um
 * portal de saúde procura o prontuário; não encontrar e **não saber por quê**
 * leva a pessoa a concluir que a tela está quebrada — e a ligar para a clínica
 * perguntando. A ausência precisa ser declarada, não subentendida.
 */

afterEach(cleanup)

const base: PortalPacienteScreenProps = {
  profile: {
    patientId: 'p1',
    clinicName: 'Clínica Aurora',
    displayName: 'Ana Souza',
    legalName: 'Ana Maria Souza',
    birthLabel: '02/03/1980',
    email: 'ana@exemplo.com',
    phone: '11999990000',
  },
  upcoming: [],
  past: [],
  invoices: [],
}

const appointment = {
  id: 'a1',
  dayLabel: '12/08',
  timeLabel: '14:30 – 15:00',
  statusLabel: 'Confirmado',
  statusTone: 'positive' as const,
  professionalName: 'Dra. Marina',
  reason: 'Retorno',
  startsAt: '2026-08-12T17:30:00.000Z',
}

function renderScreen(overrides: Partial<PortalPacienteScreenProps> = {}) {
  render(<PortalPacienteScreen {...base} {...overrides} />)
}

describe('PortalPacienteScreen', () => {
  it('declara que o prontuário não está aqui', () => {
    renderScreen()

    expect(screen.getByText(/prontuário e as anotações clínicas não ficam/i)).toBeTruthy()
  })

  it('chama a pessoa pelo primeiro nome que ela escolheu', () => {
    // `displayName` já vem com o nome social quando existe — a decisão está no
    // adapter, e a tela só respeita.
    renderScreen()

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Olá, Ana',
    )
  })

  it('sem consulta marcada, diz o que acontece quando houver', () => {
    renderScreen()

    expect(screen.getByText('Você não tem consulta marcada.')).toBeTruthy()
    expect(screen.getByText(/quando a clínica agendar/i)).toBeTruthy()
  })

  it('mostra a próxima consulta com profissional e motivo', () => {
    renderScreen({ upcoming: [appointment] })

    expect(screen.getByText('Retorno')).toBeTruthy()
    expect(screen.getByText('Dra. Marina')).toBeTruthy()
    expect(screen.getByText('Confirmado')).toBeTruthy()
  })

  it('consulta sem motivo registrado não fica em branco', () => {
    renderScreen({ upcoming: [{ ...appointment, reason: null }] })

    expect(screen.getByText('Consulta')).toBeTruthy()
  })

  it('conta as cobranças em aberto no cabeçalho', () => {
    renderScreen({
      invoices: [
        {
          id: 'i1',
          statusLabel: 'Em aberto',
          statusTone: 'pending',
          totalLabel: 'R$ 200,00',
          outstandingLabel: 'R$ 150,00',
          dueLabel: '15/08',
          isSettled: false,
        },
      ],
    })

    expect(screen.getByText('1 em aberto')).toBeTruthy()
    expect(screen.getByText(/falta R\$ 150,00/i)).toBeTruthy()
  })

  it('cobrança quitada não mostra saldo a pagar', () => {
    renderScreen({
      invoices: [
        {
          id: 'i1',
          statusLabel: 'Paga',
          statusTone: 'positive',
          totalLabel: 'R$ 200,00',
          outstandingLabel: null,
          dueLabel: null,
          isSettled: true,
        },
      ],
    })

    expect(screen.getByText('Quitada')).toBeTruthy()
    expect(screen.getByText('Nada em aberto no momento.')).toBeTruthy()
  })

  it('não promete pagamento que o produto não faz', () => {
    /*
     * Não há gateway. Um botão "pagar agora" que abre um PIX inventado seria
     * pior que a ausência dele — a pessoa acharia que pagou.
     */
    renderScreen({
      invoices: [
        {
          id: 'i1',
          statusLabel: 'Em aberto',
          statusTone: 'pending',
          totalLabel: 'R$ 200,00',
          outstandingLabel: 'R$ 200,00',
          dueLabel: null,
          isSettled: false,
        },
      ],
    })

    expect(screen.getByText(/não recebe pagamento/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /pagar/i })).toBeNull()
  })

  it('o histórico só aparece quando existe', () => {
    renderScreen()
    expect(screen.queryByText('Histórico')).toBeNull()

    cleanup()

    renderScreen({ past: [{ ...appointment, statusLabel: 'Concluído' }] })
    expect(screen.getByText('Histórico')).toBeTruthy()
  })

  it('manda corrigir dado com a recepção, e não promete edição', () => {
    // O portal é leitura. Um campo editável aqui exigiria escrita numa tabela
    // que o paciente não alcança — e a promessa quebraria no primeiro uso.
    renderScreen()

    expect(screen.getByText(/fale com a recepção/i)).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('campo não informado se declara em vez de sumir', () => {
    renderScreen({
      profile: { ...base.profile, phone: null, birthLabel: null },
    })

    expect(screen.getAllByText('Não informado')).toHaveLength(2)
  })
})
