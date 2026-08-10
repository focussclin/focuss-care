import type { Payment } from './Billing'

/**
 * Recibo de pagamento — comprovante interno, e **não documento fiscal**.
 *
 * # A distinção é a razão deste arquivo existir
 *
 * A emissão fiscal numerada depende de `issue_invoice`, cuja assinatura não pôde
 * ser verificada (bloqueio **P-RPC**), e continua ausente. Este recibo comprova
 * que a clínica recebeu um valor — o papel que se entrega no balcão —, não que
 * um documento fiscal foi emitido.
 *
 * Confundir os dois é o risco inteiro da fatia: uma clínica que trate este
 * comprovante como nota fiscal deixa de emitir a nota. Por isso o aviso fiscal
 * que já existia em `/financeiro` é repetido dentro do recibo, e não substituído.
 *
 * # Nada aqui é calculado
 *
 * O valor é o do pagamento, como foi registrado. O recibo não soma, não rateia
 * e não deduz: montar um número novo aqui criaria uma segunda contabilidade ao
 * lado da que `payments` guarda.
 */

/**
 * Como a clínica se identifica no recibo.
 *
 * `id` **não entra**: nada no comprovante o usa, e o identificador interno do
 * tenant não tem por que atravessar a fronteira só para ser impresso.
 */
export interface ReceiptClinic {
  tradeName: string
  legalName: string | null
  cnpj: string | null
}

export interface Receipt {
  paymentId: string
  clinic: ReceiptClinic
  patientName: string
  amountCents: number
  method: Payment['method']
  paidAt: Date
  /** Referência da fatura de origem — o vínculo que o recibo comprova. */
  invoiceReference: string
  notes: string | null
}

/**
 * O nome que aparece no recibo.
 *
 * Razão social quando existe, nome fantasia quando não — é a ordem que um
 * comprovante usa: quem recebe precisa saber qual pessoa jurídica recebeu.
 * Nenhum dos dois é inventado; `legalName` é opcional no cadastro, e a queda
 * para `tradeName` é a única alternativa honesta.
 */
export function receiptIssuerName(clinic: ReceiptClinic): string {
  return clinic.legalName?.trim() || clinic.tradeName
}

/**
 * A referência da fatura: número fiscal quando houver, id abreviado quando não.
 *
 * `number` só existe depois da emissão fiscal, que está bloqueada — então hoje
 * ele é sempre nulo e a referência cai no id. Oito caracteres bastam para achar
 * a cobrança na lista, e o id inteiro num papel de balcão é ruído.
 *
 * **Isto não é numeração de recibo.** Numerar comprovante exige sequência sem
 * pulo nem repetição, que é exatamente o que `document_sequences` garante e
 * esta camada não tem como garantir sozinha.
 */
export function invoiceReferenceOf(invoiceId: string, invoiceNumber: number | null): string {
  if (invoiceNumber !== null) return `Fatura nº ${invoiceNumber}`
  return `Cobrança ${invoiceId.slice(0, 8)}`
}

interface PaymentLike {
  id: string
  amountCents: number
  method: Payment['method']
  paidAt: Date
  notes: string | null
}

interface InvoiceLike {
  id: string
  number: number | null
  patientName: string
}

/** Monta o recibo a partir do que já está gravado. Não deriva valor nenhum. */
export function buildReceipt(
  clinic: ReceiptClinic,
  invoice: InvoiceLike,
  payment: PaymentLike,
): Receipt {
  return {
    paymentId: payment.id,
    clinic,
    patientName: invoice.patientName,
    amountCents: payment.amountCents,
    method: payment.method,
    paidAt: payment.paidAt,
    invoiceReference: invoiceReferenceOf(invoice.id, invoice.number),
    notes: payment.notes,
  }
}

/** Pagamentos mais recentes primeiro — o último recebimento é o que se entrega. */
export function sortPayments<T extends { paidAt: Date | string }>(
  payments: readonly T[],
): T[] {
  const time = (value: Date | string) =>
    value instanceof Date ? value.getTime() : new Date(value).getTime()
  return [...payments].sort((left, right) => time(right.paidAt) - time(left.paidAt))
}
