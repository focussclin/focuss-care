// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  RecepcaoScreen,
  type ReceptionSlotDto,
} from './RecepcaoScreen'

/**
 * A tela da recepção.
 *
 * O que ela precisa acertar não é o desenho: é **não repetir a fila**. Se ela
 * listar quem já está na clínica, passa a ser uma segunda `/atendimentos` — e
 * duas listas da mesma coisa é como elas começam a discordar.
 */

function slot(overrides: Partial<ReceptionSlotDto> = {}): ReceptionSlotDto {
  return {
    id: 'apt-1',
    patientName: 'Maria Silva',
    professionalName: 'Dra. Ana Ribeiro',
    time: '14:00',
    lateMinutes: 0,
    ...overrides,
  }
}

function renderScreen(props: Partial<Parameters<typeof RecepcaoScreen>[0]> = {}) {
  return render(
    <RecepcaoScreen
      late={[]}
      expected={[]}
      arrivedCount={0}
      waitingCount={0}
      isLive
      {...props}
    />,
  )
}

afterEach(cleanup)

describe('atrasados', () => {
  it('mostra horário, paciente e quanto tempo passou', () => {
    renderScreen({
      late: [slot({ time: '13:30', lateMinutes: 45 })],
    })

    const item = screen.getAllByRole('listitem')[0]
    expect(item.textContent).toContain('13:30')
    expect(item.textContent).toContain('Maria Silva')
    expect(item.textContent).toContain('45 min')
  })

  it.each([
    [45, '45 min'],
    [60, '1h'],
    [80, '1h20'],
    [125, '2h05'],
  ])('%i minutos vira "%s"', (minutes, expected) => {
    renderScreen({ late: [slot({ lateMinutes: minutes })] })

    expect(screen.getByText(expected)).toBeTruthy()
  })

  it('sem atrasados, diz isso em vez de lista vazia', () => {
    renderScreen({ expected: [slot()] })

    expect(screen.getByText(/ninguém atrasado/i)).toBeTruthy()
  })
})

describe('ainda esperados', () => {
  it('lista o horário sem marcar atraso', () => {
    renderScreen({ expected: [slot({ time: '16:00' })] })

    const lists = screen.getAllByRole('list')
    const item = within(lists[0]).getAllByRole('listitem')[0]

    expect(item.textContent).toContain('16:00')
    expect(item.textContent).not.toMatch(/min$/)
  })

  it('agenda vazia é dita, não escondida', () => {
    renderScreen()

    expect(screen.getByText(/nada mais marcado para hoje/i)).toBeTruthy()
  })
})

describe('não vira uma segunda fila', () => {
  it('quem já chegou aparece como CONTAGEM, não como lista', () => {
    renderScreen({ arrivedCount: 7, waitingCount: 3 })

    expect(screen.getByText('07')).toBeTruthy()
    expect(screen.getByText('03')).toBeTruthy()
  })

  it('manda para a fila em vez de repetir a fila', () => {
    renderScreen()

    const link = screen.getByRole('link', { name: /abrir a fila/i })
    expect(link.getAttribute('href')).toBe('/atendimentos')
  })
})

describe('sem banco', () => {
  it('declara que agenda e fila são exemplo', () => {
    renderScreen({ isLive: false })

    expect(screen.getByRole('status').textContent).toMatch(/demonstração local/i)
  })

  it('com banco, não polui a tela', () => {
    renderScreen()

    expect(screen.queryByRole('status')).toBeNull()
  })
})
