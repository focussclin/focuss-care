import { describe, expect, it } from 'vitest'

import {
  buildReceipt,
  invoiceReferenceOf,
  receiptIssuerName,
  sortPayments,
} from './Receipt'

const clinic = {
  tradeName: 'Clínica Aurora',
  legalName: 'Aurora Serviços Médicos Ltda',
  cnpj: '12.345.678/0001-90',
}

describe('quem emite o recibo', () => {
  it('a razão social vem primeiro', () => {
    /*
     * Quem recebe o comprovante precisa saber qual pessoa jurídica recebeu, e
     * é a razão social que responde isso.
     */
    expect(receiptIssuerName(clinic)).toBe('Aurora Serviços Médicos Ltda')
  })

  it('sem razão social, o nome fantasia', () => {
    // `legalName` é opcional no cadastro; a queda é a única alternativa honesta.
    expect(receiptIssuerName({ ...clinic, legalName: null })).toBe('Clínica Aurora')
  })

  it('razão social em branco não vira nome vazio', () => {
    expect(receiptIssuerName({ ...clinic, legalName: '   ' })).toBe('Clínica Aurora')
  })
})

/**
 * O recibo NÃO tem numeração própria.
 *
 * Numerar comprovante exige sequência sem pulo nem repetição — o que
 * `document_sequences` garante e esta camada não garante sozinha.
 */
describe('referência da cobrança', () => {
  it('usa o número fiscal quando ele existe', () => {
    expect(invoiceReferenceOf('abcdef12-3456', 42)).toBe('Fatura nº 42')
  })

  it('sem número fiscal, referencia a cobrança pelo id abreviado', () => {
    /*
     * `number` só existe depois da emissão fiscal, que está bloqueada — hoje é
     * sempre nulo. Oito caracteres bastam para achar a cobrança na lista.
     */
    expect(invoiceReferenceOf('abcdef12-3456-7890', null)).toBe('Cobrança abcdef12')
  })

  it('nunca inventa um número de recibo', () => {
    const semNumero = invoiceReferenceOf('abcdef12-3456', null)

    expect(semNumero).not.toMatch(/recibo n/i)
  })
})

describe('montagem do recibo', () => {
  const invoice = { id: 'abcdef12-3456', number: null, patientName: 'Maria Silva' }
  const payment = {
    id: 'p1',
    amountCents: 25_000,
    method: 'pix' as const,
    paidAt: new Date('2026-08-10T13:00:00.000Z'),
    notes: 'Entrada',
  }

  it('copia o que está gravado, sem calcular nada', () => {
    /*
     * O recibo não soma, não rateia e não deduz: um número novo aqui criaria
     * uma segunda contabilidade ao lado da que `payments` guarda.
     */
    const receipt = buildReceipt(clinic, invoice, payment)

    expect(receipt).toEqual({
      paymentId: 'p1',
      clinic,
      patientName: 'Maria Silva',
      amountCents: 25_000,
      method: 'pix',
      paidAt: payment.paidAt,
      invoiceReference: 'Cobrança abcdef12',
      notes: 'Entrada',
    })
  })

  it('não carrega o id da clínica', () => {
    // Nada no comprovante o usa, e o identificador do tenant não tem por que
    // atravessar a fronteira só para ser impresso.
    const receipt = buildReceipt(clinic, invoice, payment)

    expect(JSON.stringify(receipt)).not.toContain('clinicId')
    expect(receipt.clinic).not.toHaveProperty('id')
  })
})

describe('ordem dos pagamentos', () => {
  it('mais recentes primeiro', () => {
    const ordered = sortPayments([
      { id: 'velho', paidAt: '2026-01-01T10:00:00.000Z' },
      { id: 'novo', paidAt: '2026-08-10T10:00:00.000Z' },
    ])

    expect(ordered.map((item) => item.id)).toEqual(['novo', 'velho'])
  })

  it('não muda a lista recebida', () => {
    const original = [
      { id: 'a', paidAt: '2026-01-01T10:00:00.000Z' },
      { id: 'b', paidAt: '2026-08-10T10:00:00.000Z' },
    ]

    sortPayments(original)

    expect(original.map((item) => item.id)).toEqual(['a', 'b'])
  })
})
