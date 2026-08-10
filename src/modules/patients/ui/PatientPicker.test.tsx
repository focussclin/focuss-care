// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O seletor de paciente, com DOM.
 *
 * O que quebra sem avisar num campo de busca nao aparece em `typecheck`:
 * requisicao disparada a cada tecla, resposta antiga chegando depois da nova e
 * sobrescrevendo a lista, campo vazio parecendo "nenhum resultado". Sao
 * exatamente os casos abaixo.
 *
 * A Server Action e um mock — o que ela decide (clinica, papel, limite) esta em
 * `searchPatients.action.test.ts`. Aqui se verifica o que o navegador faz com a
 * resposta.
 */

const searchPatientsAction = vi.fn()

vi.mock('../actions/searchPatients.action', () => ({
  searchPatientsAction: (input: unknown) => searchPatientsAction(input),
}))

const { PatientPicker } = await import('./PatientPicker')

const INITIAL = [
  { id: 'p-1', name: 'Ana Prado' },
  { id: 'p-2', name: 'Bruno Lima' },
]

/** Envolve o seletor no estado que o formulario daria a ele. */
function Harness({
  isLive = true,
  initialOptions = INITIAL,
}: {
  isLive?: boolean
  initialOptions?: readonly { id: string; name: string }[]
}) {
  const [value, setValue] = useState('')

  return (
    <>
      <PatientPicker
        initialOptions={initialOptions}
        value={value}
        onChange={setValue}
        isLive={isLive}
      />
      <span data-testid="selected">{value}</span>
    </>
  )
}

function options() {
  return screen.queryAllByRole('option').map((el) => el.textContent)
}

function type(text: string) {
  fireEvent.change(screen.getByRole('combobox'), { target: { value: text } })
}

/** Avanca o debounce e deixa a promessa da action resolver. */
async function settle(ms = 300) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  searchPatientsAction.mockReset()
  searchPatientsAction.mockResolvedValue({ ok: true, data: [] })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------

describe('estado inicial', () => {
  it('mostra o conjunto que a rota carregou antes de qualquer tecla', () => {
    render(<Harness />)

    expect(options()).toEqual(['Ana Prado', 'Bruno Lima'])
    expect(searchPatientsAction).not.toHaveBeenCalled()
  })

  it('clinica sem paciente diz isso, e nao "nenhum resultado"', () => {
    render(<Harness initialOptions={[]} />)

    expect(screen.getByText(/nenhum paciente cadastrado ainda/i)).toBeTruthy()
  })

  it('volta ao conjunto inicial quando o campo e apagado', async () => {
    searchPatientsAction.mockResolvedValue({
      ok: true,
      data: [{ id: 'p-9', name: 'Zuleica Souza' }],
    })

    render(<Harness />)
    type('zul')
    await settle()

    expect(options()).toEqual(['Zuleica Souza'])

    type('')
    await settle()

    expect(options()).toEqual(['Ana Prado', 'Bruno Lima'])
  })
})

describe('quando consulta o servidor', () => {
  it('nao consulta com termo curto demais', async () => {
    render(<Harness />)
    type('z')
    await settle()

    expect(searchPatientsAction).not.toHaveBeenCalled()
    expect(options()).toEqual(['Ana Prado', 'Bruno Lima'])
  })

  it('espera a pessoa parar de digitar — uma consulta, nao uma por tecla', async () => {
    render(<Harness />)

    type('zu')
    type('zul')
    type('zule')
    await settle()

    expect(searchPatientsAction).toHaveBeenCalledTimes(1)
    expect(searchPatientsAction).toHaveBeenCalledWith({ query: 'zule' })
  })

  it('acha quem NAO estava no conjunto inicial — o defeito que originou a fatia', async () => {
    searchPatientsAction.mockResolvedValue({
      ok: true,
      data: [{ id: 'p-9', name: 'Zuleica Souza' }],
    })

    render(<Harness />)
    type('zuleica')
    await settle()

    expect(options()).toEqual(['Zuleica Souza'])
  })

  it('anuncia a busca em andamento e depois o resultado', async () => {
    render(<Harness />)
    type('zul')

    expect(screen.getByRole('status').textContent).toMatch(/buscando/i)

    searchPatientsAction.mockResolvedValue({
      ok: true,
      data: [{ id: 'p-9', name: 'Zuleica Souza' }],
    })
    await settle()

    expect(screen.getByRole('status').textContent).toMatch(/1 paciente/i)
  })

  it('termo sem resultado diz que nao ha ninguem com esse nome NA CLINICA', async () => {
    render(<Harness />)
    type('xyz')
    await settle()

    expect(
      screen.getByText(/nenhum paciente com esse nome nesta clínica/i),
    ).toBeTruthy()
  })
})

describe('resposta fora de ordem', () => {
  it('descarta o resultado de um termo que ja nao esta no campo', async () => {
    /*
     * "zu" demora 400ms; "zuleica" responde na hora. Sem o numero de sequencia,
     * a resposta lenta chegaria por ultimo e a lista mostraria nomes que nao
     * casam com o que esta escrito.
     */
    let releaseSlow: (() => void) | null = null

    searchPatientsAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseSlow = () =>
            resolve({ ok: true, data: [{ id: 'p-0', name: 'Resposta Velha' }] })
        }),
    )
    searchPatientsAction.mockResolvedValue({
      ok: true,
      data: [{ id: 'p-9', name: 'Zuleica Souza' }],
    })

    render(<Harness />)

    type('zu')
    await settle()

    type('zuleica')
    await settle()

    expect(options()).toEqual(['Zuleica Souza'])

    await act(async () => {
      releaseSlow?.()
    })

    expect(options()).toEqual(['Zuleica Souza'])
  })
})

describe('quando o servidor recusa', () => {
  it('mostra a mensagem do servidor, sem inventar resultado', async () => {
    searchPatientsAction.mockResolvedValue({
      ok: false,
      error: {
        code: 'forbidden',
        message: 'Você não tem permissão para consultar pacientes.',
      },
    })

    render(<Harness />)
    type('zul')
    await settle()

    expect(screen.getByRole('alert').textContent).toMatch(/não tem permissão/i)
    expect(options()).toEqual([])
  })

  it('falha de transporte tambem vira mensagem, nao tela quebrada', async () => {
    searchPatientsAction.mockRejectedValue(new Error('network'))

    render(<Harness />)
    type('zul')
    await settle()

    expect(screen.getByRole('alert').textContent).toMatch(
      /não foi possível buscar/i,
    )
  })

  it('erro de uma busca antiga nao fica na tela depois de outra dar certo', async () => {
    searchPatientsAction.mockRejectedValueOnce(new Error('network'))
    searchPatientsAction.mockResolvedValue({
      ok: true,
      data: [{ id: 'p-9', name: 'Zuleica Souza' }],
    })

    render(<Harness />)
    type('zul')
    await settle()
    expect(screen.queryByRole('alert')).toBeTruthy()

    type('zuleica')
    await settle()

    expect(screen.queryByRole('alert')).toBeNull()
    expect(options()).toEqual(['Zuleica Souza'])
  })
})

describe('escolha do paciente', () => {
  it('clicar no nome entrega o id ao formulario', async () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('option', { name: 'Bruno Lima' }))

    expect(screen.getByTestId('selected').textContent).toBe('p-2')
    expect(
      screen.getByRole('option', { name: 'Bruno Lima' }).getAttribute(
        'aria-selected',
      ),
    ).toBe('true')
  })

  it('digitar de novo apaga a escolha anterior', async () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('option', { name: 'Bruno Lima' }))
    expect(screen.getByTestId('selected').textContent).toBe('p-2')

    type('ana')
    await settle()

    // Sem isto, o formulario enviaria Bruno com "ana" escrito no campo.
    expect(screen.getByTestId('selected').textContent).toBe('')
  })
})

describe('demonstracao local (sem banco)', () => {
  it('nao chama a Server Action e diz que o conjunto e de exemplo', async () => {
    render(<Harness isLive={false} />)

    expect(screen.getByText(/demonstração local/i)).toBeTruthy()

    type('bru')
    await settle()

    expect(searchPatientsAction).not.toHaveBeenCalled()
    expect(options()).toEqual(['Bruno Lima'])
  })

  it('filtra sem acento e sem caixa', async () => {
    render(
      <Harness
        isLive={false}
        initialOptions={[{ id: 'p-3', name: 'Antônio Célio' }]}
      />,
    )

    type('antonio')
    await settle()

    expect(options()).toEqual(['Antônio Célio'])
  })
})
