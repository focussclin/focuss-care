import type {
  CashEntryKind,
  CashSessionStatus,
  InvoiceStatus,
  PayerType,
  PaymentMethod,
} from '@/lib/supabase/database.types'

/**
 * Financeiro da clínica — feature **B-01**.
 *
 * # Tudo em centavos, inteiros
 *
 * Nenhum campo abaixo é `number` com casa decimal. A conversão para texto
 * acontece só na tela, em `lib/utils/money`. Ver o cabeçalho daquele arquivo
 * para o porquê.
 *
 * # A diferença entre COBRAR e EMITIR
 *
 * `invoices` guarda as duas coisas, e confundi-las custa caro:
 *
 *  - **Cobrança** é o registro interno do que o paciente deve. Nasce em `draft`,
 *    é o que a recepção cria no balcão, e não tem número fiscal.
 *  - **Emissão** é o documento numerado (`status = 'issued'`, `number`
 *    preenchido), que sai de `next_document_number` e da RPC `issue_invoice`.
 *
 * **Esta fatia entrega apenas a cobrança.** O motivo está em
 * `BillingRepository`, e não é preguiça: numeração fiscal que pula ou repete é
 * problema com a prefeitura, não bug de tela.
 */

export interface InvoiceItem {
  id: string
  description: string
  quantity: number
  unitPriceCents: number
  discountCents: number
  /** `quantity × unitPrice − discount`, calculado no SERVIDOR. */
  totalCents: number
}

/** O que a recepção digita ao criar um item. Sem `totalCents`: ele é derivado. */
export interface NewInvoiceItem {
  description: string
  quantity: number
  unitPriceCents: number
  discountCents: number
}

export interface Invoice {
  id: string
  patientId: string
  patientName: string
  /** O agendamento que originou a cobrança. Nulo em cobrança avulsa. */
  appointmentId: string | null
  /** Nulo enquanto a cobrança não virou documento fiscal. */
  number: number | null
  status: InvoiceStatus
  subtotalCents: number
  discountCents: number
  totalCents: number
  /** Soma dos pagamentos registrados. Derivada, nunca digitada. */
  paidCents: number
  dueDate: Date | null
  notes: string | null
  createdAt: Date
  items: readonly InvoiceItem[]
  /**
   * Os recebimentos individuais desta cobrança.
   *
   * `paidCents` continua sendo o total e a fonte do saldo — nada aqui
   * recalcula dinheiro. Esta lista existe porque um RECIBO comprova UM
   * recebimento, com valor, método e data próprios: o total sozinho não permite
   * emitir comprovante nenhum.
   */
  payments: readonly Payment[]
}

/**
 * Uma cobrança vista pelo portão de pagamento.
 *
 * O mínimo para responder "quanto falta pagar deste atendimento": nada de itens,
 * pagamentos ou nome — é lido a cada chamada de paciente.
 *
 * Estruturalmente compatível com `VisitCharge` de `lib/clinic/visit-stage.ts`,
 * que é quem decide o que conta como dívida. A compatibilidade é de propósito e
 * a dependência não existe: o domínio do financeiro não conhece `lib/`.
 */
export interface AppointmentCharge {
  id: string
  status: InvoiceStatus
  totalCents: number
  paidCents: number
  payerType: PayerType
}

export interface NewInvoiceData {
  patientId: string
  /**
   * O agendamento que originou a cobrança, ou `null`.
   *
   * `null` é o caso comum e continua valendo: cobrança avulsa, produto vendido
   * no balcão, encaixe sem hora marcada. O vínculo existe para a etapa em que a
   * fila do profissional pergunta se ESTE atendimento está pago — sem ele, a
   * pergunta não tem como ser feita (ver `PAGAMENTO_ANTES_DA_CONSULTA.md`).
   */
  appointmentId: string | null
  /** Desconto aplicado ao total, além dos descontos por item. */
  discountCents: number
  dueDate: Date | null
  notes: string | null
  items: readonly NewInvoiceItem[]
}

export interface Payment {
  id: string
  invoiceId: string
  amountCents: number
  method: PaymentMethod
  paidAt: Date
  notes: string | null
}

export interface NewPaymentData {
  invoiceId: string
  amountCents: number
  method: PaymentMethod
  notes: string | null
}

/** Despesa administrativa registrada para a clínica. */
export type PayableStatus = 'open' | 'overdue' | 'paid'

export interface Payable {
  id: string
  description: string
  category: string | null
  supplier: string | null
  amountCents: number
  dueDate: Date
  paidAt: Date | null
  paidAmountCents: number
  method: PaymentMethod | null
  isRecurring: boolean
  notes: string | null
  status: PayableStatus
  createdAt: Date
}

export interface NewPayableData {
  description: string
  category: string | null
  supplier: string | null
  amountCents: number
  dueDate: Date
  isRecurring: boolean
  notes: string | null
}

export interface SettlePayableData {
  payableId: string
  method: PaymentMethod
}

/**
 * O turno do caixa.
 *
 * `expectedCents` é o que DEVERIA haver na gaveta: abertura mais entradas menos
 * saídas. `countedCents` é o que a pessoa contou de fato. A diferença entre os
 * dois é o número que interessa — e ela é registrada mesmo quando incomoda,
 * porque caixa que só fecha certo não serve para descobrir nada.
 */
export interface CashSession {
  id: string
  status: CashSessionStatus
  openedAt: Date
  openedByName: string
  openingAmountCents: number
  closedAt: Date | null
  expectedCents: number | null
  countedCents: number | null
  differenceCents: number | null
  notes: string | null
}

export interface CashEntry {
  id: string
  kind: CashEntryKind
  amountCents: number
  description: string
  category: string | null
  /** Preenchido quando a entrada nasceu de um pagamento em espécie. */
  paymentId: string | null
  createdAt: Date
}

/** Sessão aberta com o que já passou por ela — a tela do caixa em um objeto. */
export interface OpenCashSession {
  session: CashSession
  entries: readonly CashEntry[]
  /** Abertura + entradas − saídas, calculado a partir de `entries`. */
  expectedCents: number
}

/**
 * Resumo financeiro de um período.
 *
 * Nenhum campo é estimado. `receivedCents` sai de `payments`; `openCents` sai do
 * que falta pagar em faturas não canceladas. **Não há "despesas"** — o produto
 * registra despesas por meio de `payables`; o painel de contas a pagar mantém
 * esse controle separado da receita recebida, sem chamar despesa de lucro.
 */
export interface FinanceSummary {
  from: Date
  to: Date
  /** Somatório dos pagamentos recebidos no período. */
  receivedCents: number
  /** O que ainda falta receber, de faturas em aberto. */
  openCents: number
  /** Quantas cobranças ainda não foram quitadas. */
  openInvoices: number
  /** Faturas criadas no período. */
  issuedInvoices: number
}
