// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { OperationalInsight } from '../application/operationalInsights'
import { InsightsScreen } from './InsightsScreen'

const insight: OperationalInsight = {
  id: 'waiting-now',
  severity: 'critical',
  title: '2 pacientes aguardam atendimento',
  description: 'A fila presencial tem pessoas aguardando agora.',
  actionLabel: 'Abrir recepção',
  href: '/atendimentos',
  source: 'waiting_queue · hoje',
}

afterEach(cleanup)

describe('InsightsScreen', () => {
  it('mostra fonte e ação real do insight', () => {
    render(<InsightsScreen insights={[insight]} isLive periodLabel="mês atual" />)

    expect(screen.getByText(insight.title)).toBeTruthy()
    expect(screen.getByText(`Base: ${insight.source}`)).toBeTruthy()
    expect(screen.getByRole('link', { name: /abrir recepção/i }).getAttribute('href')).toBe('/atendimentos')
  })

  it('mostra estado vazio sem fabricar alertas', () => {
    render(<InsightsScreen insights={[]} isLive periodLabel="mês atual" />)

    expect(screen.getByText('Nenhum alerta operacional')).toBeTruthy()
    expect(screen.queryByText(/ação imediata/i)).toBeNull()
  })
})
