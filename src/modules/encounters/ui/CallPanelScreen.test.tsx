// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O painel de chamada, com DOM.
 *
 * Dois comportamentos só existem aqui e nenhum aparece em `typecheck`:
 *
 *  - a tela **se atualiza sozinha**. Ninguém opera uma TV de sala de espera; se
 *    o intervalo sumir numa refatoração, o painel congela na chamada das oito da
 *    manhã e a sala continua confiando nele;
 *  - `router.refresh()` é o único caminho de atualização, o que mantém a leitura
 *    no servidor, com sessão e RLS. Um `fetch` do cliente passaria despercebido.
 */

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

const { CallPanelScreen } = await import('./CallPanelScreen')

const NOW_CALLING = {
  id: 'q-1',
  displayName: 'Maria A. S.',
  professionalName: 'Dra. Ana Ribeiro',
}

beforeEach(() => {
  vi.useFakeTimers()
  refresh.mockClear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('chamada atual', () => {
  it('mostra o nome abreviado e para onde ir', () => {
    render(
      <CallPanelScreen
        nowCalling={NOW_CALLING}
        previousCalls={[]}
        waitingCount={0}
        isLive
      />,
    )

    expect(screen.getByText('Maria A. S.')).toBeTruthy()
    expect(screen.getByText('Dra. Ana Ribeiro')).toBeTruthy()
  })

  it('anuncia a troca para leitor de tela', () => {
    render(
      <CallPanelScreen
        nowCalling={NOW_CALLING}
        previousCalls={[]}
        waitingCount={0}
        isLive
      />,
    )

    expect(
      screen.getByText('Maria A. S.').getAttribute('aria-live'),
    ).toBe('polite')
  })

  it('sem chamada, diz isso em vez de ficar em branco', () => {
    render(
      <CallPanelScreen
        nowCalling={null}
        previousCalls={[]}
        waitingCount={4}
        isLive
      />,
    )

    expect(screen.getByText(/nenhuma chamada no momento/i)).toBeTruthy()
  })
})

describe('quem espera é contagem, não lista', () => {
  it.each([
    [1, /pessoa aguardando/i],
    [5, /pessoas aguardando/i],
  ])('%i concorda em número', (count, expected) => {
    render(
      <CallPanelScreen
        nowCalling={null}
        previousCalls={[]}
        waitingCount={count}
        isLive
      />,
    )

    expect(screen.getByText(String(count))).toBeTruthy()
    expect(screen.getByText(expected)).toBeTruthy()
  })
})

describe('chamadas anteriores', () => {
  it('lista as anteriores, da mais recente para a mais antiga', () => {
    render(
      <CallPanelScreen
        nowCalling={NOW_CALLING}
        previousCalls={[
          { id: 'q-2', displayName: 'Bruno L.', professionalName: null },
          { id: 'q-3', displayName: 'Ana S.', professionalName: 'Dr. Paulo' },
        ]}
        waitingCount={2}
        isLive
      />,
    )

    const items = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(items[0]).toContain('Bruno L.')
    expect(items[1]).toContain('Ana S.')
  })

  it('sem histórico, explica em vez de mostrar lista vazia', () => {
    render(
      <CallPanelScreen
        nowCalling={NOW_CALLING}
        previousCalls={[]}
        waitingCount={0}
        isLive
      />,
    )

    expect(screen.getByText(/ainda não houve chamadas hoje/i)).toBeTruthy()
  })
})

describe('a parede se atualiza sozinha', () => {
  it('pede nova renderização ao servidor periodicamente', () => {
    render(
      <CallPanelScreen
        nowCalling={NOW_CALLING}
        previousCalls={[]}
        waitingCount={0}
        isLive
      />,
    )

    expect(refresh).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(15_000)
    })
    expect(refresh).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('para de pedir quando a tela sai — sem timer órfão', () => {
    const view = render(
      <CallPanelScreen
        nowCalling={NOW_CALLING}
        previousCalls={[]}
        waitingCount={0}
        isLive
      />,
    )

    view.unmount()

    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('sem banco', () => {
  it('declara que o painel não está ligado à fila real', () => {
    render(
      <CallPanelScreen
        nowCalling={NOW_CALLING}
        previousCalls={[]}
        waitingCount={0}
        isLive={false}
      />,
    )

    expect(screen.getByRole('status').textContent).toMatch(
      /demonstração local/i,
    )
  })

  it('com banco, não polui a parede com aviso', () => {
    render(
      <CallPanelScreen
        nowCalling={NOW_CALLING}
        previousCalls={[]}
        waitingCount={0}
        isLive
      />,
    )

    expect(screen.queryByRole('status')).toBeNull()
  })
})
