// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthorizationDto } from '../schemas/insurance.schema'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const transitionAuthorizationAction = vi.fn()
vi.mock('../actions/authorizations.action', () => ({
  transitionAuthorizationAction: (input: unknown) =>
    transitionAuthorizationAction(input),
  answerAuthorizationAction: vi.fn(),
  createAuthorizationAction: vi.fn(),
}))

vi.mock('../actions/providers.action', () => ({
  createProviderAction: vi.fn(),
  createPlanAction: vi.fn(),
}))

vi.mock('../actions/patientInsurances.action', () => ({
  createPatientInsuranceAction: vi.fn(),
}))

vi.mock('../actions/claimDenials.action', () => ({
  createClaimDenialAction: vi.fn(),
  advanceClaimDenialAction: vi.fn(),
}))

const { ConveniosScreen } = await import('./ConveniosScreen')

const authorization: AuthorizationDto = {
  id: '11111111-1111-4111-8111-111111111111',
  patientName: 'Maria Silva',
  planName: 'Plano Pleno',
  providerName: 'Operadora Aurora',
  authorizationNumber: 'AUT-9001',
  status: 'approved',
  procedures: [{ code: '10101012', description: 'Consulta', quantity: 1 }],
  requestedAt: '2026-08-01T10:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
  denialReason: null,
}

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  transitionAuthorizationAction.mockResolvedValue({ ok: true, data: authorization })
})

function renderScreen(
  overrides: Partial<React.ComponentProps<typeof ConveniosScreen>> = {},
) {
  return render(
    <ConveniosScreen
      summary={{
        providers: 1,
        plans: 1,
        activeCards: 1,
        pendingAuthorizations: 0,
        openDenialsCents: 0,
      } as never}
      providers={[]}
      plans={[]}
      authorizations={[authorization]}
      cards={[]}
      claimDenials={[]}
      claimInvoices={[]}
      patientInsurances={[]}
      patients={[]}
      canManage
      isLive
      {...overrides}
    />,
  )
}

/**
 * O ciclo da guia que faltava.
 *
 * O módulo alcançava três das seis situações do enum. Uma guia aprovada não
 * tinha para onde ir, e a lista de autorizadas crescia sem distinguir a já
 * usada da que ainda vale.
 */
describe('ciclo da guia', () => {
  it('guia aprovada oferece baixar e cancelar', () => {
    renderScreen()

    expect(screen.getByRole('button', { name: /marcar como utilizada/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /cancelar guia/i })).toBeTruthy()
  })

  it('baixar manda o estado que a tela viu, para o WHERE do UPDATE', async () => {
    /*
     * `from` não é redundante com o id: sem ele, duas pessoas mexendo na mesma
     * guia se sobrescreveriam.
     */
    renderScreen()

    fireEvent.click(screen.getByRole('button', { name: /marcar como utilizada/i }))

    await waitFor(() =>
      expect(transitionAuthorizationAction).toHaveBeenCalledWith({
        authorizationId: authorization.id,
        from: 'approved',
        to: 'used',
      }),
    )
  })

  it('guia pendente só oferece cancelar — quem aprova é a operadora', () => {
    renderScreen({ authorizations: [{ ...authorization, status: 'requested' }] })

    expect(screen.getByRole('button', { name: /cancelar guia/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /marcar como utilizada/i })).toBeNull()
    // A resposta continua sendo o fluxo próprio, com número ou motivo.
    expect(screen.getByRole('button', { name: /registrar resposta/i })).toBeTruthy()
  })

  it('guia negada não oferece transição nenhuma', () => {
    renderScreen({ authorizations: [{ ...authorization, status: 'denied' }] })

    expect(screen.queryByRole('button', { name: /marcar como utilizada/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /cancelar guia/i })).toBeNull()
  })

  it('guia utilizada é estado final', () => {
    renderScreen({ authorizations: [{ ...authorization, status: 'used' }] })

    expect(screen.getByText('Utilizada')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /cancelar guia/i })).toBeNull()
  })

  it('a recusa do servidor aparece, e não some em silêncio', async () => {
    transitionAuthorizationAction.mockResolvedValue({
      ok: false,
      error: { code: 'conflict', message: 'Esta guia não está mais autorizada.' },
    })
    renderScreen()

    fireEvent.click(screen.getByRole('button', { name: /marcar como utilizada/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/não está mais autorizada/i),
    )
  })

  it('sem permissão, nenhuma transição é oferecida', () => {
    renderScreen({ canManage: false })

    expect(screen.queryByRole('button', { name: /marcar como utilizada/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /cancelar guia/i })).toBeNull()
  })
})

/**
 * Vencimento é comparação de data, e aparece AO LADO do status gravado.
 */
describe('vencimento derivado', () => {
  it('guia aprovada com prazo passado mostra o selo', () => {
    renderScreen({
      authorizations: [{ ...authorization, expiresAt: '2020-01-01T00:00:00.000Z' }],
    })

    expect(screen.getByText('Prazo vencido')).toBeTruthy()
    // O status gravado continua visível: o selo acompanha, não substitui.
    expect(screen.getByText('Autorizada')).toBeTruthy()
  })

  it('prazo futuro não mostra selo', () => {
    renderScreen()

    expect(screen.queryByText('Prazo vencido')).toBeNull()
  })

  it('guia sem prazo não afirma vencimento', () => {
    renderScreen({ authorizations: [{ ...authorization, expiresAt: null }] })

    expect(screen.queryByText('Prazo vencido')).toBeNull()
  })

  it('guia negada com prazo passado não vence — ela já terminou', () => {
    renderScreen({
      authorizations: [
        { ...authorization, status: 'denied', expiresAt: '2020-01-01T00:00:00.000Z' },
      ],
    })

    expect(screen.queryByText('Prazo vencido')).toBeNull()
  })

  it('a tela nunca grava `expired`', () => {
    /*
     * Sem processo que rode todo dia, gravar o status faria guia vencida
     * conviver com outra vencida ainda marcada "Autorizada".
     */
    renderScreen({
      authorizations: [{ ...authorization, expiresAt: '2020-01-01T00:00:00.000Z' }],
    })

    expect(screen.queryByRole('button', { name: /vencer|expirar/i })).toBeNull()
  })
})
