// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ChiefComplaintField } from './ChiefComplaintField'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const setChiefComplaintAction = vi.fn(async (input: unknown) => {
  void input
  return { ok: true as const, data: {} as never }
})

vi.mock('../actions/setChiefComplaint.action', () => ({
  setChiefComplaintAction: (input: unknown) => setChiefComplaintAction(input),
}))

const ENCOUNTER = '9019956f-bdd8-4d61-868d-09b02332dad0'

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

function renderField(
  overrides: Partial<React.ComponentProps<typeof ChiefComplaintField>> = {},
) {
  return render(
    <ChiefComplaintField
      encounterId={ENCOUNTER}
      value={null}
      canWrite
      {...overrides}
    />,
  )
}

describe('exibição', () => {
  it('mostra a queixa registrada', () => {
    renderField({ value: 'Dor torácica há 2 dias' })

    expect(screen.getByText(/dor torácica há 2 dias/i)).toBeTruthy()
  })

  it('sem queixa, diz que não foi registrada — e não fica em branco', () => {
    /*
     * Campo vazio sem rótulo faria parecer defeito de carregamento. "Não
     * registrada" é o estado normal de um atendimento que acabou de começar.
     */
    renderField()

    expect(screen.getByText(/não registrada/i)).toBeTruthy()
  })

  it('começa fechado: a tela de atendimentos é operacional', () => {
    // Um campo de texto aberto em cada linha empurraria "quem está com quem"
    // para baixo, que é o que essa tela existe para mostrar.
    renderField()

    expect(screen.queryByLabelText(/queixa principal/i)).toBeNull()
  })
})

describe('permissão', () => {
  it('sem `record.write`, não há como editar', () => {
    renderField({ canWrite: false, value: 'Cefaleia' })

    expect(screen.queryByRole('button', { name: /editar|registrar/i })).toBeNull()
    // O texto continua visível: quem chega aqui já passou por `record.read`.
    expect(screen.getByText(/cefaleia/i)).toBeTruthy()
  })

  it('com permissão, oferece registrar quando está vazia', () => {
    renderField()

    expect(screen.getByRole('button', { name: /registrar/i })).toBeTruthy()
  })

  it('com queixa já registrada, oferece editar', () => {
    renderField({ value: 'Cefaleia' })

    expect(screen.getByRole('button', { name: /editar/i })).toBeTruthy()
  })
})

describe('edição', () => {
  it('salva o texto digitado', async () => {
    renderField()

    fireEvent.click(screen.getByRole('button', { name: /registrar/i }))
    fireEvent.change(screen.getByLabelText(/queixa principal/i), {
      target: { value: 'Cefaleia há 3 dias' },
    })
    fireEvent.click(screen.getByRole('button', { name: /salvar queixa/i }))

    await waitFor(() =>
      expect(setChiefComplaintAction).toHaveBeenCalledWith({
        encounterId: ENCOUNTER,
        chiefComplaint: 'Cefaleia há 3 dias',
      }),
    )
  })

  it('abre já preenchido com o que está gravado', () => {
    // Abrir vazio faria a edição apagar a queixa de quem só queria completá-la.
    renderField({ value: 'Cefaleia' })

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))

    expect(
      screen.getByLabelText<HTMLTextAreaElement>(/queixa principal/i).value,
    ).toBe('Cefaleia')
  })

  it('cancelar não envia nada', () => {
    renderField({ value: 'Cefaleia' })

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(setChiefComplaintAction).not.toHaveBeenCalled()
    expect(screen.getByText(/cefaleia/i)).toBeTruthy()
  })

  it('apagar o texto é permitido — correção legítima', () => {
    renderField({ value: 'Cefaleia' })

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    fireEvent.change(screen.getByLabelText(/queixa principal/i), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: /salvar queixa/i }))

    expect(setChiefComplaintAction).toHaveBeenCalledWith({
      encounterId: ENCOUNTER,
      chiefComplaint: '',
    })
  })
})

describe('falhas', () => {
  it('a recusa do servidor aparece e o formulário continua aberto', async () => {
    /*
     * Fechar aqui deixaria a pessoa achando que salvou. A queixa é o que
     * justifica a conduta — sumir com a recusa é o pior desfecho possível.
     */
    setChiefComplaintAction.mockResolvedValue({
      ok: false,
      error: { code: 'conflict', message: 'Este atendimento já foi encerrado.' },
    } as never)

    renderField()

    fireEvent.click(screen.getByRole('button', { name: /registrar/i }))
    fireEvent.change(screen.getByLabelText(/queixa principal/i), {
      target: { value: 'Cefaleia' },
    })
    fireEvent.click(screen.getByRole('button', { name: /salvar queixa/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('encerrado'),
    )
    expect(screen.getByLabelText(/queixa principal/i)).toBeTruthy()
  })

  it('modo demonstração não oferece escrita', () => {
    renderField({ canWrite: false })

    expect(screen.queryByRole('button', { name: /registrar/i })).toBeNull()
  })
})
