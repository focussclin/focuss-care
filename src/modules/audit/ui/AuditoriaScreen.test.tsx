// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AuditoriaScreen } from './AuditoriaScreen'

/**
 * A trilha só serve se a pergunta que ela responde tiver como ser feita.
 *
 * O evento mais sensível do produto — leitura de dado clínico — não tinha
 * atalho nesta tela: chegava-se a ele digitando `record.read` no campo de ação
 * personalizada, o que exige saber o nome do verbo de antemão.
 */

const PATIENT = '22222222-2222-4222-8222-222222222222'

afterEach(cleanup)

function renderScreen(overrides: Partial<React.ComponentProps<typeof AuditoriaScreen>> = {}) {
  render(
    <AuditoriaScreen
      entries={[
        {
          id: 4218,
          action: 'record.read',
          entityType: 'patient',
          entityId: PATIENT,
          actorRole: 'receptionist',
          occurredAt: '2026-08-11T12:00:00.000Z',
        },
      ]}
      hasMore={false}
      page={1}
      action={null}
      entityType={null}
      isLive
      {...overrides}
    />,
  )
}

describe('os filtros alcançam o acesso clínico', () => {
  it('a leitura de dado clínico é uma opção, não um verbo a decorar', () => {
    renderScreen()

    const option = screen.getByRole('option', { name: 'Dado clínico lido' })

    expect(option).toBeTruthy()
    expect((option as HTMLOptionElement).value).toBe('record.read')
  })

  it('as escritas do prontuário também têm atalho', () => {
    renderScreen()

    expect(screen.getByRole('option', { name: /prontuário criado/i })).toBeTruthy()
    expect(screen.getByRole('option', { name: /prontuário corrigido/i })).toBeTruthy()
  })
})

describe('o que a listagem NÃO mostra', () => {
  it('nenhum metadado bruto do evento aparece na tabela', () => {
    /*
     * `after` carrega os escopos clínicos lidos. Eles servem à consulta no
     * banco, não à tela: exibi-los aqui daria a `audit.read` — que `admin` tem
     * e `record.read` não — uma leitura lateral do que foi acessado.
     */
    renderScreen()

    expect(screen.queryByText(/clinical_scopes|patient_chart/)).toBeNull()
    expect(screen.getByText(/metadados brutos não são exibidos/i)).toBeTruthy()
  })

  it('o id da entidade aparece encurtado, nunca inteiro', () => {
    renderScreen()

    expect(screen.queryByText(PATIENT)).toBeNull()
  })
})
