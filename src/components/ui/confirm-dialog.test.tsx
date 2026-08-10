// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ConfirmDialog, type ConfirmDialogProps } from './confirm-dialog'

/**
 * A regra que este componente existe para guardar: **não fecha sem sucesso**.
 *
 * Ela vale a pena estar num lugar só porque o modo de errar é sempre o mesmo, e
 * é silencioso: chamar a action, que devolve promessa, e fechar na linha
 * seguinte sem esperar. O componente desmonta, a resposta chega para ninguém, e
 * a recusa do servidor vira sucesso aos olhos de quem clicou.
 *
 * Foi assim no cancelamento da agenda e no cancelamento de cobrança — dois
 * lugares, o mesmo erro, escrito duas vezes. Os testes abaixo verificam
 * AUSÊNCIA de fechamento, que é a forma do defeito.
 */

afterEach(cleanup)

function renderDialog(overrides: Partial<ConfirmDialogProps> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Cancelar cobrança',
    confirmLabel: 'Cancelar cobrança',
    onConfirm: vi.fn().mockResolvedValue(null),
    ...overrides,
  } satisfies ConfirmDialogProps

  render(<ConfirmDialog {...props} />)

  return props
}

const confirmar = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar cobrança' }))

describe('ConfirmDialog', () => {
  it('fecha quando onConfirm devolve null', async () => {
    const props = renderDialog()

    confirmar()

    await waitFor(() => expect(props.onOpenChange).toHaveBeenCalledWith(false))
  })

  it('NÃO fecha quando o servidor recusa, e mostra o motivo', async () => {
    const props = renderDialog({
      onConfirm: vi.fn().mockResolvedValue('Esta cobrança já recebeu pagamento.'),
    })

    confirmar()

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Esta cobrança já recebeu pagamento.',
      ),
    )
    expect(props.onOpenChange).not.toHaveBeenCalled()
  })

  it('NÃO fecha quando onConfirm lança', async () => {
    /*
     * Rede caída e action explodindo levam ao mesmo lugar que a recusa: o pior
     * desfecho não é a mensagem genérica, é fechar limpo sobre uma ação que não
     * aconteceu.
     */
    const props = renderDialog({
      onConfirm: vi.fn().mockRejectedValue(new Error('offline')),
    })

    vi.spyOn(console, 'error').mockImplementation(() => {})
    confirmar()

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(props.onOpenChange).not.toHaveBeenCalled()
  })

  it('exige motivo quando pedido, sem chamar o servidor', async () => {
    const props = renderDialog({
      reason: {
        label: 'Motivo',
        required: true,
        missingMessage: 'Escreva o motivo antes de cancelar.',
      },
    })

    confirmar()

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Escreva o motivo antes de cancelar.',
      ),
    )
    expect(props.onConfirm).not.toHaveBeenCalled()
  })

  it('entrega o motivo escrito, já sem espaços nas pontas', async () => {
    const onConfirm = vi.fn().mockResolvedValue(null)
    renderDialog({ reason: { label: 'Motivo', required: true }, onConfirm })

    fireEvent.change(screen.getByLabelText('Motivo'), {
      target: { value: '  cobrança duplicada  ' },
    })
    confirmar()

    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith('cobrança duplicada'),
    )
  })

  it('sem motivo pedido, entrega null em vez de string vazia', async () => {
    /*
     * `cancelInvoiceAction` recebia `reason: ''` fixo, e o schema convertia para
     * null — mas a tela nunca perguntava. Aqui a ausência é explícita: quem não
     * pede motivo recebe `null`, e não uma string que finge ser resposta.
     */
    const onConfirm = vi.fn().mockResolvedValue(null)
    renderDialog({ onConfirm })

    confirmar()

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(null))
  })

  it('trava os botões enquanto a ação está em voo', async () => {
    let resolver: (value: string | null) => void = () => {}
    const onConfirm = vi.fn(
      () => new Promise<string | null>((resolve) => (resolver = resolve)),
    )

    renderDialog({ onConfirm, pendingLabel: 'Cancelando…' })
    confirmar()

    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Voltar' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true),
    )

    resolver(null)
  })

  it('não dispara duas vezes com clique duplo', async () => {
    let resolver: (value: string | null) => void = () => {}
    const onConfirm = vi.fn(
      () => new Promise<string | null>((resolve) => (resolver = resolve)),
    )

    renderDialog({ onConfirm })

    confirmar()
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))

    /*
     * Em voo o botão troca de rótulo E fica desabilitado — por isso o segundo
     * clique é procurado pelo nome novo. Se um dia o `disabled` cair, este
     * teste pega: o clique encontraria o botão e a action rodaria duas vezes,
     * que em cancelamento de cobrança é dois eventos de auditoria para um
     * cancelamento só.
     */
    const emVoo = screen.getByRole('button', { name: 'Cancelar cobrança…' })
    expect((emVoo as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(emVoo)
    expect(onConfirm).toHaveBeenCalledTimes(1)

    resolver(null)
  })

  it('reabrir vem limpo, sem o erro da tentativa anterior', async () => {
    const { rerender } = render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Cancelar"
        confirmLabel="Cancelar"
        onConfirm={() => 'Falhou na cobrança anterior.'}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())

    const props = {
      onOpenChange: vi.fn(),
      title: 'Cancelar',
      confirmLabel: 'Cancelar',
      onConfirm: () => null,
    }

    rerender(<ConfirmDialog open={false} {...props} />)
    rerender(<ConfirmDialog open {...props} />)

    /*
     * Sem o reset, "Falhou na cobrança anterior" apareceria sobre um alvo novo
     * — acusando a cobrança errada de um problema que ela não tem.
     */
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
