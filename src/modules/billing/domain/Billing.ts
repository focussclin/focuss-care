import type {
  CashEntryKind,
  CashSessionStatus,
  InvoiceStatus,
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
}

export interface NewInvoiceData {
  patientId: string
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
 * ainda não registra contas a pagar (`payables` existe e nenhuma tela grava
 * nela), e um card de despesas em R$ 0,00 diria que a clínica não tem custo.
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
