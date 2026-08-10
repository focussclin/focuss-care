// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { IndicadoresScreen, type MonthlyPointDto } from './IndicadoresScreen'

/**
 * A tela de indicadores.
 *
 * Dois grupos importam mais que o desenho:
 *
 *  - **acessibilidade do gráfico.** As barras são `<div>` decorativas; o dado de
 *    verdade está numa tabela. Se a tabela sumir numa refatoração, quem usa
 *    leitor de tela fica sem nenhum número — e nada quebra visivelmente.
 *  - **a variação sem base.** Mês anterior em zero não pode virar "+100%":
 *    crescer do nada não é percentual, e é o caso do primeiro mês de qualquer
 *    clínica.
 */

function point(overrides: Partial<MonthlyPointDto> = {}): MonthlyPointDto {
  return {
    label: 'ago/26',
    appointments: 10,
    completed: 8,
    newPatients: 3,
    ...overrides,
  }
}

afterEach(cleanup)

describe('o dado existe em texto, não só em barra', () => {
  it('publica cada série como tabela com cabeçalho', () => {
    render(
      <IndicadoresScreen
        points={[point({ label: 'jul/26' }), point({ label: 'ago/26' })]}
        isLive
      />,
    )

    const tables = screen.getAllByRole('table')
    expect(tables).toHaveLength(3)

    // A primeira série é "Atendimentos marcados".
    const rows = within(tables[0]).getAllByRole('row')
    expect(rows[1].textContent).toContain('jul/26')
    expect(rows[2].textContent).toContain('ago/26')
  })

  it('cada tabela tem legenda que diz o que ela é', () => {
    render(<IndicadoresScreen points={[point()]} isLive />)

    expect(
      screen.getByText(/atendimentos marcados por mês/i),
    ).toBeTruthy()
  })
})

describe('variação do último mês', () => {
  it('não inventa percentual quando o mês anterior foi zero', () => {
    render(
      <IndicadoresScreen
        points={[
          point({ label: 'jul/26', appointments: 0, completed: 0, newPatients: 0 }),
          point({ label: 'ago/26', appointments: 7, completed: 7, newPatients: 7 }),
        ]}
        isLive
      />,
    )

    expect(screen.getAllByText(/sem base de comparação/i)).toHaveLength(3)
    expect(screen.queryByText(/\+100%/)).toBeNull()
  })

  it('mostra queda com sinal negativo', () => {
    render(
      <IndicadoresScreen
        points={[
          point({ label: 'jul/26', appointments: 10 }),
          point({ label: 'ago/26', appointments: 5 }),
        ]}
        isLive
      />,
    )

    expect(screen.getByText('-50% no mês')).toBeTruthy()
  })

  it('mostra crescimento com sinal positivo', () => {
    render(
      <IndicadoresScreen
        points={[
          point({ label: 'jul/26', appointments: 10 }),
          point({ label: 'ago/26', appointments: 15 }),
        ]}
        isLive
      />,
    )

    expect(screen.getByText('+50% no mês')).toBeTruthy()
  })

  it('diz "estável" em vez de "+0%"', () => {
    render(
      <IndicadoresScreen
        points={[
          point({ label: 'jul/26', appointments: 10 }),
          point({ label: 'ago/26', appointments: 10 }),
        ]}
        isLive
      />,
    )

    expect(screen.getAllByText(/estável no mês/i).length).toBeGreaterThan(0)
  })
})

describe('clínica sem histórico', () => {
  it('diz que não há histórico em vez de desenhar barras vazias', () => {
    render(
      <IndicadoresScreen
        points={[
          point({ appointments: 0, completed: 0, newPatients: 0 }),
          point({
            label: 'ago/26',
            appointments: 0,
            completed: 0,
            newPatients: 0,
          }),
        ]}
        isLive
      />,
    )

    expect(screen.getByText(/ainda não há histórico/i)).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('sem banco', () => {
  it('declara que a série vem dos dados de exemplo', () => {
    render(<IndicadoresScreen points={[point()]} isLive={false} />)

    expect(screen.getByRole('status').textContent).toMatch(/demonstração local/i)
  })

  it('com banco, não polui a tela com aviso', () => {
    render(<IndicadoresScreen points={[point()]} isLive />)

    expect(screen.queryByRole('status')).toBeNull()
  })
})
