// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { InvoiceDto, InvoicePaymentDto } from '../schemas/billing.schema'
import { ReceiptModal } from './ReceiptModal'

const clinic = {
  tradeName: 'Clínica Aurora',
  legalName: 'Aurora Serviços Médicos Ltda',
  cnpj: '12.345.678/0001-90',
}

const payment: InvoicePaymentDto = {
  id: 'p1',
  amountCents: 25_000,
  method: 'pix',
  paidAt: '2026-08-10T13:00:00.000Z',
  notes: null,
}

const invoice: InvoiceDto = {
  id: 'abcdef12-3456-7890',
  patientName: 'Maria Silva',
  appointmentId: null,
  number: null,
  status: 'paid',
  totalCents: 25_000,
  paidCents: 25_000,
  remainingCents: 0,
  dueDate: null,
  createdAt: '2026-08-10T10:00:00.000Z',
  items: [],
  payments: [payment],
}

afterEach(cleanup)

function renderModal(
  overrides: Partial<React.ComponentProps<typeof ReceiptModal>> = {},
) {
  return render(
    <ReceiptModal
      open
      onOpenChange={vi.fn()}
      clinic={clinic}
      invoice={invoice}
      payment={payment}
      {...overrides}
    />,
  )
}

/**
 * O recibo é comprovante interno, e a tela não deixa dúvida.
 */
describe('não é documento fiscal', () => {
  it('o aviso aparece DENTRO do recibo', () => {
    /*
     * O aviso da tela de trás não acompanha o comprovante impresso, e uma
     * clínica que trate este papel como nota fiscal deixa de emitir a nota.
     */
    renderModal()

    expect(screen.getByText(/NÃO é documento fiscal/i)).toBeTruthy()
  })

  it('a descrição do modal repete a distinção', () => {
    renderModal()

    expect(screen.getByText(/Não substitui documento fiscal/i)).toBeTruthy()
  })

  it('não há numeração de recibo', () => {
    // Numerar comprovante exige sequência sem pulo nem repetição.
    renderModal()

    expect(screen.queryByText(/recibo n[ºo°]/i)).toBeNull()
  })

  it('não há geração de PDF, envio ou assinatura', () => {
    /*
     * Imprimir existe e usa o navegador; gerar arquivo, enviar e assinar não —
     * as três exigiriam integração que esta instalação não tem.
     */
    renderModal()

    expect(
      screen.queryByRole('button', { name: /pdf|baixar|enviar|assinar/i }),
    ).toBeNull()
  })
})

describe('identidade da clínica', () => {
  it('mostra a razão social e o CNPJ', () => {
    renderModal()

    expect(screen.getByText('Aurora Serviços Médicos Ltda')).toBeTruthy()
    expect(screen.getByText(/CNPJ 12\.345\.678\/0001-90/)).toBeTruthy()
  })

  it('sem CNPJ cadastrado, diz que falta — e não inventa', () => {
    renderModal({ clinic: { ...clinic, cnpj: null } })

    expect(screen.getByText(/CNPJ não cadastrado/i)).toBeTruthy()
  })

  it('sem razão social, usa o nome fantasia', () => {
    renderModal({ clinic: { ...clinic, legalName: null } })

    expect(screen.getByText('Clínica Aurora')).toBeTruthy()
  })

  it('falha ao carregar a clínica não vira nome inventado', () => {
    renderModal({ clinic: null })

    expect(screen.getByText(/não foi possível carregar os dados da clínica/i)).toBeTruthy()
    expect(screen.queryByText('Aurora Serviços Médicos Ltda')).toBeNull()
  })

  it('o id da clínica não aparece em lugar nenhum', () => {
    /*
     * O contrato do DTO não o carrega; este teste guarda a decisão.
     *
     * A leitura é de `document.body` porque o diálogo vive num portal — em
     * `container` o texto vem vazio, e a asserção passaria sem olhar nada.
     */
    renderModal()

    const printed = document.body.textContent ?? ''
    expect(printed).toContain('Aurora Serviços Médicos Ltda')
    expect(printed).not.toContain('clinicId')
  })
})

describe('o conteúdo do comprovante', () => {
  it('traz de quem, quanto, como e quando', () => {
    renderModal()

    expect(screen.getByText('Maria Silva')).toBeTruthy()
    expect(screen.getByText('R$ 250,00')).toBeTruthy()
    expect(screen.getByText('PIX')).toBeTruthy()
    expect(screen.getByText(/10 de agosto de 2026/)).toBeTruthy()
  })

  it('referencia a cobrança de origem', () => {
    renderModal()

    expect(screen.getByText('Cobrança abcdef12')).toBeTruthy()
  })

  it('usa o número fiscal quando a fatura tiver um', () => {
    renderModal({ invoice: { ...invoice, number: 42 } })

    expect(screen.getByText('Fatura nº 42')).toBeTruthy()
  })

  it('observação só aparece quando existe', () => {
    renderModal()
    expect(screen.queryByText('Observações')).toBeNull()

    cleanup()
    renderModal({ payment: { ...payment, notes: 'Entrada de 50%' } })
    expect(screen.getByText('Entrada de 50%')).toBeTruthy()
  })

  it('método desconhecido aparece cru, e não vira "Outro"', () => {
    /*
     * Traduzir um método que o produto não conhece para "Outro" esconderia um
     * valor que veio do banco — melhor mostrar o que está gravado.
     */
    renderModal({ payment: { ...payment, method: 'boleto' } })

    expect(screen.getByText('boleto')).toBeTruthy()
  })

  it('sem pagamento selecionado, não renderiza comprovante nenhum', () => {
    renderModal({ payment: null, invoice: null })

    expect(screen.queryByText('Maria Silva')).toBeNull()
  })
})

/**
 * A impressão é do NAVEGADOR, com folha preparada.
 *
 * `window.print()` sozinho sairia com o painel do financeiro atrás e o
 * comprovante cortado: o diálogo é posicionado com `fixed` e `transform`. A
 * folha em `globals.css` esconde a página e neutraliza o posicionamento,
 * mirando o que estiver marcado com `data-receipt-sheet`.
 */
describe('impressão', () => {
  it('a folha do comprovante é marcada para a regra de impressão', () => {
    /*
     * A consulta é em `document.body`, e não no `container` do render: o Radix
     * monta o diálogo num PORTAL, fora da árvore devolvida por `render`.
     */
    renderModal()

    expect(document.body.querySelector('[data-receipt-sheet]')).toBeTruthy()
  })

  it('o botão chama a impressão do navegador', () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)

    renderModal()
    fireEvent.click(screen.getByRole('button', { name: /imprimir/i }))

    expect(print).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('sem pagamento selecionado, não há o que imprimir', () => {
    renderModal({ payment: null, invoice: null })

    expect(screen.getByRole('button', { name: /imprimir/i }).hasAttribute('disabled')).toBe(true)
  })

  it('os botões não vão para o papel', () => {
    // Botão impresso é tinta gasta com um controle que ninguém pode clicar.
    renderModal()

    const footer = screen.getByRole('button', { name: /imprimir/i }).parentElement
    expect(footer?.className).toContain('print:hidden')
  })
})
