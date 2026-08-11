// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { usePaletteSearch } from './usePaletteSearch'

/**
 * A espinha das quatro buscas da paleta.
 *
 * O que este arquivo protege é o que a duplicação anterior errava calado: o
 * indicador que não desliga e o resultado do termo anterior parado na tela.
 */

interface Hit {
  id: string
}

function Harness({
  action,
  enabled = true,
  open = true,
}: {
  action: (input: { query: string }) => Promise<
    { ok: true; data: readonly Hit[] } | { ok: false; error: { message: string } }
  >
  enabled?: boolean
  open?: boolean
}) {
  const [query, setQuery] = useState('')
  const search = usePaletteSearch({
    open,
    query,
    enabled,
    action,
    failureMessage: 'sem resposta',
  })

  return (
    <div>
      <input
        aria-label="termo"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <p data-testid="pending">{search.pending ? 'carregando' : 'parado'}</p>
      <p data-testid="error">{search.error ?? 'sem erro'}</p>
      <ul>
        {search.results.map((hit) => (
          <li key={hit.id}>{hit.id}</li>
        ))}
      </ul>
    </div>
  )
}

afterEach(cleanup)

function type(value: string) {
  fireEvent.change(screen.getByLabelText('termo'), { target: { value } })
}

describe('o indicador é derivado do termo respondido', () => {
  it('acende no instante em que a pessoa digita, antes do debounce', () => {
    /*
     * Não é o efeito que o liga: se fosse, a tela mostraria "nenhum resultado"
     * durante os 250ms de espera — e quem lesse concluiria que não há o que
     * procurar.
     */
    render(<Harness action={vi.fn().mockResolvedValue({ ok: true, data: [] })} />)

    type('mar')

    expect(screen.getByTestId('pending').textContent).toBe('carregando')
  })

  it('apaga quando a resposta chega', async () => {
    render(
      <Harness
        action={vi.fn().mockResolvedValue({ ok: true, data: [{ id: 'a' }] })}
      />,
    )

    type('mar')

    await waitFor(() => expect(screen.getByText('a')).toBeTruthy())
    expect(screen.getByTestId('pending').textContent).toBe('parado')
  })

  it('não acende para quem não alcança a fonte', () => {
    const action = vi.fn()

    render(<Harness action={action} enabled={false} />)
    type('mar')

    // Sem permissão a consulta nem sai: a action recusaria, e o vermelho da
    // recusa apareceria a cada tecla.
    expect(screen.getByTestId('pending').textContent).toBe('parado')
    expect(action).not.toHaveBeenCalled()
  })

  it('com a paleta fechada, nada é consultado', () => {
    const action = vi.fn()

    render(<Harness action={action} open={false} />)
    type('mar')

    expect(action).not.toHaveBeenCalled()
  })

  it('uma letra não consulta', () => {
    const action = vi.fn()

    render(<Harness action={action} />)
    type('m')

    expect(action).not.toHaveBeenCalled()
    expect(screen.getByTestId('pending').textContent).toBe('parado')
  })
})

describe('o resultado pertence ao termo que está no campo', () => {
  it('trocar o termo apaga a lista anterior no mesmo instante', async () => {
    render(
      <Harness
        action={vi.fn().mockResolvedValue({ ok: true, data: [{ id: 'a' }] })}
      />,
    )

    type('mar')
    await waitFor(() => expect(screen.getByText('a')).toBeTruthy())

    type('mari')

    // Sem isto, a lista de "mar" ficaria na tela enquanto "mari" carrega — e
    // quem apertasse Enter abriria o registro errado.
    expect(screen.queryByText('a')).toBeNull()
  })

  it('resposta atrasada de um termo antigo é descartada', async () => {
    const action = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ ok: true, data: [{ id: 'antigo' }] }), 400),
          ),
      )
      .mockResolvedValue({ ok: true, data: [{ id: 'novo' }] })

    render(<Harness action={action} />)

    type('mar')
    /*
     * A primeira consulta precisa TER SAÍDO antes da troca — se a segunda tecla
     * vier dentro dos 250ms, o próprio debounce a cancela e não há resposta
     * atrasada para descartar. O caso real é a pessoa parar, a consulta sair, e
     * ela continuar digitando enquanto o servidor ainda pensa.
     */
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1))

    type('mari')

    await waitFor(() => expect(screen.getByText('novo')).toBeTruthy())

    await new Promise((resolve) => setTimeout(resolve, 500))

    expect(screen.queryByText('antigo')).toBeNull()
    expect(screen.getByText('novo')).toBeTruthy()
  })
})

describe('falha', () => {
  it('a recusa do servidor vira mensagem, e a lista fica vazia', async () => {
    render(
      <Harness
        action={vi
          .fn()
          .mockResolvedValue({ ok: false, error: { message: 'recusado' } })}
      />,
    )

    type('mar')

    await waitFor(() =>
      expect(screen.getByTestId('error').textContent).toBe('recusado'),
    )
    expect(screen.getByTestId('pending').textContent).toBe('parado')
  })

  it('exceção na chamada usa a mensagem da fonte', async () => {
    render(<Harness action={vi.fn().mockRejectedValue(new Error('rede'))} />)

    type('mar')

    await waitFor(() =>
      expect(screen.getByTestId('error').textContent).toBe('sem resposta'),
    )
  })

  it('o erro do termo anterior não sobra no seguinte', async () => {
    const action = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { message: 'recusado' } })
      .mockResolvedValue({ ok: true, data: [] })

    render(<Harness action={action} />)

    type('mar')
    await waitFor(() =>
      expect(screen.getByTestId('error').textContent).toBe('recusado'),
    )

    type('mari')

    expect(screen.getByTestId('error').textContent).toBe('sem erro')
  })
})
