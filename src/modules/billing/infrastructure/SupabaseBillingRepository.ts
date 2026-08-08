import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  CashEntryKind,
  CashSessionStatus,
  Database,
  InvoiceStatus,
  PaymentMethod,
} from '@/lib/supabase/database.types'

import type {
  CashEntry,
  CashSession,
  FinanceSummary,
  Invoice,
  InvoiceItem,
  NewInvoiceData,
  NewPaymentData,
  OpenCashSession,
  Payable,
  NewPayableData,
  SettlePayableData,
  Payment,
} from '../domain/Billing'
import type { BillingRepository } from '../domain/BillingRepository'
import { BillingRepositoryError } from '../domain/BillingRepositoryError'

type Client = SupabaseClient<Database>

const INVOICE_SELECT = `
  id,
  patient_id,
  number,
  status,
  subtotal_cents,
  discount_cents,
  total_cents,
  paid_cents,
  due_date,
  notes,
  created_at,
  patients ( full_name ),
  invoice_items (
    id,
    description,
    quantity,
    unit_price_cents,
    discount_cents,
    total_cents
  )
`

/** Teto de linhas por consulta de período. Ver `PERIOD_ROW_CAP` em `reporting`. */
const ROW_CAP = 2000

const PAYABLE_SELECT =
  'id, description, category, supplier, amount_cents, due_date, paid_at, paid_amount_cents, method, is_recurring, notes, created_at'

/** Status que ainda esperam dinheiro. */
const OPEN_STATUSES: readonly InvoiceStatus[] = [
  'draft',
  'issued',
  'partially_paid',
  'overdue',
]

interface InvoiceRow {
  id: string
  patient_id: string
  number: number | null
  status: InvoiceStatus
  subtotal_cents: number
  discount_cents: number
  total_cents: number
  paid_cents: number
  due_date: string | null
  notes: string | null
  created_at: string
  patients: { full_name: string } | null
  invoice_items: {
    id: string
    description: string
    quantity: number
    unit_price_cents: number
    discount_cents: number
    total_cents: number | null
  }[]
}

interface PayableRow {
  id: string
  description: string
  category: string | null
  supplier: string | null
  amount_cents: number
  due_date: string
  paid_at: string | null
  paid_amount_cents: number | null
  method: PaymentMethod | null
  is_recurring: boolean
  notes: string | null
  created_at: string
}

/**
 * Adapter financeiro — feature **B-01**.
 *
 * # Duas regras que valem para o arquivo inteiro
 *
 *  1. **Nenhum total vem do cliente.** Quantidade e preço unitário vêm do
 *     formulário; subtotal, desconto aplicado e total são calculados aqui. Quem
 *     controla o total controla quanto o paciente deve.
 *  2. **`paid_cents` é sempre RECALCULADO da soma dos pagamentos**, nunca
 *     incrementado. Somar sobre o valor anterior transforma uma repetição de
 *     requisição em dinheiro duplicado; recalcular faz a repetição ser inócua.
 *
 * # O que este adapter faz sem transação
 *
 * O PostgREST não expõe transação, e três operações aqui tocam mais de uma
 * tabela: criar fatura com itens, registrar pagamento (pagamento + fatura +
 * caixa) e fechar o turno. Cada uma documenta, no seu lugar, o que acontece se
 * o segundo passo falhar — e todas foram ordenadas para que a falha deixe o
 * sistema **devendo registro**, nunca **inventando dinheiro**.
 */
export class SupabaseBillingRepository implements BillingRepository {
  constructor(private readonly client: Client) {}

  async listPayables(clinicId: string, through: Date): Promise<Payable[]> {
    const { data, error } = await this.client
      .from('payables')
      .select(PAYABLE_SELECT)
      .eq('clinic_id', clinicId)
      .lte('due_date', toDateOnly(through))
      .order('paid_at', { ascending: true, nullsFirst: true })
      .order('due_date', { ascending: true })
      .limit(ROW_CAP)

    if (error) throw readFailure('listPayables', error)

    return ((data ?? []) as unknown as PayableRow[]).map((row) =>
      toPayable(row),
    )
  }

  async createPayable(
    clinicId: string,
    data: NewPayableData,
    createdBy: string,
  ): Promise<Payable> {
    const { data: row, error } = await this.client
      .from('payables')
      .insert({
        clinic_id: clinicId,
        description: data.description,
        category: data.category,
        supplier: data.supplier,
        amount_cents: data.amountCents,
        due_date: toDateOnly(data.dueDate),
        is_recurring: data.isRecurring,
        notes: data.notes,
        created_by: createdBy,
      })
      .select(PAYABLE_SELECT)
      .single()

    if (error) throw toWriteError(error)

    return toPayable(row as unknown as PayableRow)
  }

  async settlePayable(
    clinicId: string,
    data: SettlePayableData,
  ): Promise<Payable> {
    const current = await this.requirePayable(clinicId, data.payableId)

    if (current.paidAt) {
      throw new BillingRepositoryError(
        'payable-paid',
        'despesa ja foi baixada',
      )
    }

    const now = new Date().toISOString()
    const { data: row, error } = await this.client
      .from('payables')
      .update({
        paid_at: now,
        paid_amount_cents: current.amountCents,
        method: data.method,
        updated_at: now,
      })
      .eq('clinic_id', clinicId)
      .eq('id', data.payableId)
      .is('paid_at', null)
      .select(PAYABLE_SELECT)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!row) throw new BillingRepositoryError('payable-paid', 'despesa ja foi baixada')

    return toPayable(row as unknown as PayableRow)
  }

  async listInvoices(
    clinicId: string,
    from: Date,
    to: Date,
  ): Promise<Invoice[]> {
    const { data, error } = await this.client
      .from('invoices')
      .select(INVOICE_SELECT)
      .eq('clinic_id', clinicId)
      .gte('created_at', from.toISOString())
      .lt('created_at', to.toISOString())
      .order('created_at', { ascending: false })
      .limit(ROW_CAP)

    if (error) throw readFailure('listInvoices', error)

    return (data as unknown as InvoiceRow[]).map(toInvoice)
  }

  async summary(
    clinicId: string,
    from: Date,
    to: Date,
  ): Promise<FinanceSummary> {
    /*
     * Somas em JavaScript, e não no banco.
     *
     * O PostgREST não agrega sem uma view, e criar view exige migration — que
     * este ambiente não aplica (B1). Trazer `amount_cents` de um período e somar
     * aqui é exato (são inteiros) e cabe: mesmo uma clínica movimentada não faz
     * 2.000 pagamentos por mês.
     */
    const [paymentsResult, openResult, issuedResult] = await Promise.all([
      this.client
        .from('payments')
        .select('amount_cents')
        .eq('clinic_id', clinicId)
        .gte('paid_at', from.toISOString())
        .lt('paid_at', to.toISOString())
        .limit(ROW_CAP),
      this.client
        .from('invoices')
        .select('total_cents, paid_cents')
        .eq('clinic_id', clinicId)
        .in('status', [...OPEN_STATUSES])
        .limit(ROW_CAP),
      this.client
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .gte('created_at', from.toISOString())
        .lt('created_at', to.toISOString()),
    ])

    if (paymentsResult.error) throw readFailure('summary', paymentsResult.error)
    if (openResult.error) throw readFailure('summary', openResult.error)
    if (issuedResult.error) throw readFailure('summary', issuedResult.error)

    const receivedCents = (paymentsResult.data ?? []).reduce(
      (total, row) => total + row.amount_cents,
      0,
    )

    /*
     * "Em aberto" é o SALDO, não o total das faturas em aberto.
     *
     * Uma fatura de R$ 300 com R$ 200 já pagos tem R$ 100 a receber. Somar o
     * total diria que a clínica tem a receber dinheiro que já entrou — e o card
     * é lido justamente para decidir a quem ligar.
     */
    const openCents = (openResult.data ?? []).reduce(
      (total, row) => total + Math.max(row.total_cents - row.paid_cents, 0),
      0,
    )

    return {
      from,
      to,
      receivedCents,
      openCents,
      openInvoices: (openResult.data ?? []).length,
      issuedInvoices: issuedResult.count ?? 0,
    }
  }

  async createInvoice(
    clinicId: string,
    data: NewInvoiceData,
    createdBy: string,
  ): Promise<Invoice> {
    const items = data.items.map((item) => ({
      ...item,
      totalCents: Math.max(
        item.quantity * item.unitPriceCents - item.discountCents,
        0,
      ),
    }))

    const subtotalCents = items.reduce((total, item) => total + item.totalCents, 0)
    const totalCents = Math.max(subtotalCents - data.discountCents, 0)

    const { data: invoiceRow, error } = await this.client
      .from('invoices')
      .insert({
        clinic_id: clinicId,
        patient_id: data.patientId,
        payer_type: 'patient',
        /*
         * Nasce em `draft`, e NÃO em `issued`.
         *
         * `issued` significa documento fiscal numerado, e a numeração pertence a
         * `next_document_number` + `issue_invoice` — fora de alcance (ver a
         * porta). Marcar `issued` aqui alegaria uma emissão que não aconteceu.
         */
        status: 'draft',
        subtotal_cents: subtotalCents,
        discount_cents: data.discountCents,
        total_cents: totalCents,
        paid_cents: 0,
        due_date: data.dueDate ? toDateOnly(data.dueDate) : null,
        notes: data.notes,
        created_by: createdBy,
      })
      .select('id')
      .single()

    if (error) throw toWriteError(error)

    if (items.length > 0) {
      const { error: itemsError } = await this.client
        .from('invoice_items')
        .insert(
          items.map((item) => ({
            clinic_id: clinicId,
            invoice_id: invoiceRow.id,
            description: item.description,
            quantity: item.quantity,
            unit_price_cents: item.unitPriceCents,
            discount_cents: item.discountCents,
            // `total_cents` é opcional no Insert gerado — sinal de coluna
            // calculada pelo banco. Não mandamos para não brigar com ela.
          })),
        )

      if (itemsError) {
        /*
         * Sem transação, a fatura já existe. Cancelá-la é o desfecho menos
         * ruim: uma cobrança sem itens cobraria um valor que ninguém consegue
         * conferir. O cancelamento preserva a linha, com o motivo — apagar
         * seria perder o rastro de que algo deu errado aqui.
         */
        await this.client
          .from('invoices')
          .update({
            status: 'canceled',
            canceled_at: new Date().toISOString(),
            cancel_reason: 'falha ao gravar os itens da cobranca',
            updated_at: new Date().toISOString(),
          })
          .eq('clinic_id', clinicId)
          .eq('id', invoiceRow.id)

        throw toWriteError(itemsError)
      }
    }

    return this.requireInvoice(clinicId, invoiceRow.id)
  }

  async cancelInvoice(
    clinicId: string,
    invoiceId: string,
    reason: string | null,
  ): Promise<Invoice> {
    const current = await this.requireInvoice(clinicId, invoiceId)

    if (current.paidCents > 0) {
      throw new BillingRepositoryError(
        'invoice-paid',
        'cobranca com pagamento registrado',
      )
    }

    const now = new Date().toISOString()

    const { data, error } = await this.client
      .from('invoices')
      .update({
        status: 'canceled',
        canceled_at: now,
        cancel_reason: reason,
        updated_at: now,
      })
      .eq('clinic_id', clinicId)
      .eq('id', invoiceId)
      // Cancelar duas vezes sobrescreveria a data da primeira.
      .neq('status', 'canceled')
      .select('id')
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!data) throw notFound(invoiceId)

    return this.requireInvoice(clinicId, invoiceId)
  }

  async registerPayment(
    clinicId: string,
    data: NewPaymentData,
    receivedBy: string,
  ): Promise<Payment> {
    const invoice = await this.requireInvoice(clinicId, data.invoiceId)

    if (invoice.status === 'canceled') throw notFound(data.invoiceId)

    const remaining = invoice.totalCents - invoice.paidCents
    if (data.amountCents > remaining) {
      throw new BillingRepositoryError(
        'overpayment',
        `pagamento de ${data.amountCents} acima do saldo ${remaining}`,
      )
    }

    const paidAt = new Date().toISOString()

    /*
     * O pagamento entra PRIMEIRO, e não por acaso.
     *
     * Ele é o fato — dinheiro que a pessoa entregou. `invoices.paid_cents` é
     * projeção dele. Se a atualização da fatura falhar, o pagamento existe e o
     * saldo fica desatualizado, o que se corrige relendo a soma. A ordem
     * inversa perderia o registro do dinheiro, que não se corrige com nada.
     */
    const { data: paymentRow, error } = await this.client
      .from('payments')
      .insert({
        clinic_id: clinicId,
        invoice_id: data.invoiceId,
        amount_cents: data.amountCents,
        method: data.method,
        paid_at: paidAt,
        installments: 1,
        notes: data.notes,
        received_by: receivedBy,
      })
      .select('id, invoice_id, amount_cents, method, paid_at, notes')
      .single()

    if (error) throw toWriteError(error)

    await this.refreshInvoiceBalance(clinicId, data.invoiceId, invoice.totalCents)

    if (data.method === 'cash') {
      await this.mirrorCashPayment(clinicId, paymentRow.id, data, receivedBy)
    }

    return {
      id: paymentRow.id,
      invoiceId: paymentRow.invoice_id,
      amountCents: paymentRow.amount_cents,
      method: paymentRow.method,
      paidAt: new Date(paymentRow.paid_at),
      notes: paymentRow.notes,
    }
  }

  /**
   * Recalcula `paid_cents` a partir da SOMA dos pagamentos.
   *
   * Somar sobre o valor anterior transformaria uma requisição repetida em
   * dinheiro duplicado. Recalcular faz a repetição ser inócua — e conserta
   * sozinho qualquer divergência deixada por uma falha anterior.
   */
  private async refreshInvoiceBalance(
    clinicId: string,
    invoiceId: string,
    totalCents: number,
  ): Promise<void> {
    const { data, error } = await this.client
      .from('payments')
      .select('amount_cents')
      .eq('clinic_id', clinicId)
      .eq('invoice_id', invoiceId)
      .limit(ROW_CAP)

    if (error) throw toWriteError(error)

    const paidCents = (data ?? []).reduce(
      (total, row) => total + row.amount_cents,
      0,
    )

    const status: InvoiceStatus =
      paidCents >= totalCents && totalCents > 0
        ? 'paid'
        : paidCents > 0
          ? 'partially_paid'
          : 'draft'

    const { error: updateError } = await this.client
      .from('invoices')
      .update({
        paid_cents: paidCents,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('clinic_id', clinicId)
      .eq('id', invoiceId)

    if (updateError) throw toWriteError(updateError)
  }

  /**
   * Pagamento em espécie vira lançamento de caixa.
   *
   * Sem isso, o turno fecharia com diferença do tamanho de tudo o que entrou em
   * dinheiro — e a diferença deixaria de significar alguma coisa.
   *
   * Sem caixa aberto, não há onde lançar: o pagamento continua válido, e o log
   * registra a lacuna. Recusar o pagamento porque o caixa está fechado seria
   * impedir a clínica de receber.
   */
  private async mirrorCashPayment(
    clinicId: string,
    paymentId: string,
    data: NewPaymentData,
    createdBy: string,
  ): Promise<void> {
    const { data: session, error } = await this.client
      .from('cash_sessions')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('status', 'open')
      .maybeSingle()

    if (error || !session) {
      console.error('[billing] pagamento em especie sem caixa aberto', {
        code: error?.code ?? null,
      })
      return
    }

    const { error: entryError } = await this.client
      .from('cash_entries')
      .insert({
        clinic_id: clinicId,
        cash_session_id: session.id,
        kind: 'in',
        category: 'pagamento',
        amount_cents: data.amountCents,
        description: 'Pagamento recebido em dinheiro',
        payment_id: paymentId,
        created_by: createdBy,
      })

    if (entryError) {
      console.error('[billing] lancamento de caixa recusado', {
        code: entryError.code ?? null,
      })
    }
  }

  async currentCashSession(clinicId: string): Promise<OpenCashSession | null> {
    const { data: session, error } = await this.client
      .from('cash_sessions')
      .select(
        'id, status, opened_at, opened_by, opening_amount_cents, closed_at, expected_amount_cents, counted_amount_cents, difference_cents, notes',
      )
      .eq('clinic_id', clinicId)
      .eq('status', 'open')
      .maybeSingle()

    if (error) throw readFailure('currentCashSession', error)
    if (!session) return null

    const [entries, openerName] = await Promise.all([
      this.listCashEntries(clinicId, session.id),
      this.resolveName(session.opened_by),
    ])

    return {
      session: {
        id: session.id,
        status: session.status as CashSessionStatus,
        openedAt: new Date(session.opened_at),
        openedByName: openerName,
        openingAmountCents: session.opening_amount_cents,
        closedAt: session.closed_at ? new Date(session.closed_at) : null,
        expectedCents: session.expected_amount_cents,
        countedCents: session.counted_amount_cents,
        differenceCents: session.difference_cents,
        notes: session.notes,
      },
      entries,
      expectedCents: expectedFrom(session.opening_amount_cents, entries),
    }
  }

  async openCashSession(
    clinicId: string,
    openingAmountCents: number,
    openedBy: string,
  ): Promise<CashSession> {
    // Dois turnos abertos ao mesmo tempo tornam impossível dizer a qual gaveta
    // um lançamento pertence.
    const existing = await this.currentCashSession(clinicId)
    if (existing) {
      throw new BillingRepositoryError(
        'cash-session-conflict',
        'ja existe caixa aberto nesta clinica',
      )
    }

    const now = new Date().toISOString()

    const { data, error } = await this.client
      .from('cash_sessions')
      .insert({
        clinic_id: clinicId,
        status: 'open',
        opened_by: openedBy,
        opened_at: now,
        opening_amount_cents: openingAmountCents,
      })
      .select('id, status, opened_at, opened_by, opening_amount_cents')
      .single()

    if (error) throw toWriteError(error)

    return {
      id: data.id,
      status: data.status as CashSessionStatus,
      openedAt: new Date(data.opened_at),
      openedByName: await this.resolveName(data.opened_by),
      openingAmountCents: data.opening_amount_cents,
      closedAt: null,
      expectedCents: null,
      countedCents: null,
      differenceCents: null,
      notes: null,
    }
  }

  async addCashEntry(
    clinicId: string,
    sessionId: string,
    entry: { kind: 'in' | 'out'; amountCents: number; description: string },
    createdBy: string,
  ): Promise<CashEntry> {
    await this.requireOpenSession(clinicId, sessionId)

    const { data, error } = await this.client
      .from('cash_entries')
      .insert({
        clinic_id: clinicId,
        cash_session_id: sessionId,
        kind: entry.kind,
        amount_cents: entry.amountCents,
        description: entry.description,
        created_by: createdBy,
      })
      .select('id, kind, amount_cents, description, category, payment_id, created_at')
      .single()

    if (error) throw toWriteError(error)

    return {
      id: data.id,
      kind: data.kind as CashEntryKind,
      amountCents: data.amount_cents,
      description: data.description,
      category: data.category,
      paymentId: data.payment_id,
      createdAt: new Date(data.created_at),
    }
  }

  async closeCashSession(
    clinicId: string,
    sessionId: string,
    countedAmountCents: number,
    closedBy: string,
  ): Promise<CashSession> {
    const session = await this.requireOpenSession(clinicId, sessionId)
    const entries = await this.listCashEntries(clinicId, sessionId)

    const expectedCents = expectedFrom(session.opening_amount_cents, entries)
    const now = new Date().toISOString()

    /*
     * A RPC `close_cash_session` existe e faria isto de forma atômica — e sua
     * assinatura é `Record<string, unknown>` em `database.types.ts`, ou seja,
     * não resolvida (bloqueio B1). Chamá-la seria adivinhar nomes de parâmetro
     * numa operação que fecha dinheiro.
     *
     * O cálculo abaixo é o mesmo que ela faria, e o `eq('status','open')` no
     * `where` garante que dois fechamentos concorrentes não gravem valores
     * diferentes: o segundo não encontra linha.
     */
    const { data, error } = await this.client
      .from('cash_sessions')
      .update({
        status: 'closed',
        closed_by: closedBy,
        closed_at: now,
        expected_amount_cents: expectedCents,
        counted_amount_cents: countedAmountCents,
        difference_cents: countedAmountCents - expectedCents,
      })
      .eq('clinic_id', clinicId)
      .eq('id', sessionId)
      .eq('status', 'open')
      .select(
        'id, status, opened_at, opened_by, opening_amount_cents, closed_at, expected_amount_cents, counted_amount_cents, difference_cents, notes',
      )
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!data) throw notFound(sessionId)

    return {
      id: data.id,
      status: data.status as CashSessionStatus,
      openedAt: new Date(data.opened_at),
      openedByName: await this.resolveName(data.opened_by),
      openingAmountCents: data.opening_amount_cents,
      closedAt: data.closed_at ? new Date(data.closed_at) : null,
      expectedCents: data.expected_amount_cents,
      countedCents: data.counted_amount_cents,
      differenceCents: data.difference_cents,
      notes: data.notes,
    }
  }

  private async requireOpenSession(
    clinicId: string,
    sessionId: string,
  ): Promise<{ opening_amount_cents: number }> {
    const { data, error } = await this.client
      .from('cash_sessions')
      .select('opening_amount_cents')
      .eq('clinic_id', clinicId)
      .eq('id', sessionId)
      .eq('status', 'open')
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!data) {
      throw new BillingRepositoryError(
        'cash-session-conflict',
        `caixa ${sessionId} nao esta aberto nesta clinica`,
      )
    }

    return data
  }

  private async listCashEntries(
    clinicId: string,
    sessionId: string,
  ): Promise<CashEntry[]> {
    const { data, error } = await this.client
      .from('cash_entries')
      .select('id, kind, amount_cents, description, category, payment_id, created_at')
      .eq('clinic_id', clinicId)
      .eq('cash_session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(ROW_CAP)

    if (error) throw readFailure('listCashEntries', error)

    return (data ?? []).map((row) => ({
      id: row.id,
      kind: row.kind as CashEntryKind,
      amountCents: row.amount_cents,
      description: row.description,
      category: row.category,
      paymentId: row.payment_id,
      createdAt: new Date(row.created_at),
    }))
  }

  private async requireInvoice(
    clinicId: string,
    invoiceId: string,
  ): Promise<Invoice> {
    const { data, error } = await this.client
      .from('invoices')
      .select(INVOICE_SELECT)
      .eq('clinic_id', clinicId)
      .eq('id', invoiceId)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!data) throw notFound(invoiceId)

    return toInvoice(data as unknown as InvoiceRow)
  }

  private async requirePayable(
    clinicId: string,
    payableId: string,
  ): Promise<Payable> {
    const { data, error } = await this.client
      .from('payables')
      .select(PAYABLE_SELECT)
      .eq('clinic_id', clinicId)
      .eq('id', payableId)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!data) throw notFound(payableId)

    return toPayable(data as unknown as PayableRow)
  }

  /** Nome de quem abriu ou fechou. Ausência não vira linha em branco. */
  private async resolveName(userId: string | null): Promise<string> {
    if (!userId) return 'Alguém da equipe'

    const { data, error } = await this.client
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle()

    if (error || !data) return 'Alguém da equipe'

    return data.full_name
  }
}

function toInvoice(row: InvoiceRow): Invoice {
  const items: InvoiceItem[] = (row.invoice_items ?? []).map((item) => ({
    id: item.id,
    description: item.description,
    quantity: item.quantity,
    unitPriceCents: item.unit_price_cents,
    discountCents: item.discount_cents,
    /*
     * `invoice_items.total_cents` é nullable e provavelmente calculado pelo
     * banco (é opcional no tipo de Insert). O cálculo aqui é o mesmo, e serve de
     * rede: item sem total não pode virar `NaN` numa soma de dinheiro.
     */
    totalCents:
      item.total_cents ??
      Math.max(item.quantity * item.unit_price_cents - item.discount_cents, 0),
  }))

  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patients?.full_name ?? 'Paciente',
    number: row.number,
    status: row.status,
    subtotalCents: row.subtotal_cents,
    discountCents: row.discount_cents,
    totalCents: row.total_cents,
    paidCents: row.paid_cents,
    dueDate: row.due_date ? new Date(`${row.due_date}T00:00:00`) : null,
    notes: row.notes,
    createdAt: new Date(row.created_at),
    items,
  }
}

function toPayable(row: PayableRow): Payable {
  const paidAmountCents = row.paid_amount_cents ?? 0
  const paidAt = row.paid_at ? new Date(row.paid_at) : null
  const dueDate = new Date(`${row.due_date}T00:00:00`)
  const status = paidAt
    ? 'paid'
    : dueDate.getTime() < startOfToday().getTime()
      ? 'overdue'
      : 'open'

  return {
    id: row.id,
    description: row.description,
    category: row.category,
    supplier: row.supplier,
    amountCents: row.amount_cents,
    dueDate,
    paidAt,
    paidAmountCents,
    method: row.method,
    isRecurring: row.is_recurring,
    notes: row.notes,
    status,
    createdAt: new Date(row.created_at),
  }
}

function startOfToday(): Date {
  const today = new Date()
  return new Date(today.getFullYear(), today.getMonth(), today.getDate())
}

/** Abertura + entradas − saídas. A gaveta em um número. */
function expectedFrom(
  openingCents: number,
  entries: readonly CashEntry[],
): number {
  return entries.reduce(
    (total, entry) =>
      entry.kind === 'in' ? total + entry.amountCents : total - entry.amountCents,
    openingCents,
  )
}

/** `Date` -> 'YYYY-MM-DD' local. `due_date` é `date`, não `timestamptz`. */
function toDateOnly(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function notFound(id: string): BillingRepositoryError {
  return new BillingRepositoryError(
    'not-found',
    `registro ${id} indisponivel nesta clinica`,
  )
}

function readFailure(
  context: string,
  error: { code?: string | null },
): Error {
  console.error(`[billing] ${context}`, { code: error.code ?? null })

  return new Error('Não foi possível carregar o financeiro.')
}

/**
 * Traduz a recusa do Postgres.
 *
 * Só `reason` e `code` sobem para o log. A mensagem pode ecoar valores enviados
 * — aqui, nome de paciente na descrição do item e observação de pagamento — e
 * log é lido por muito mais gente que a tabela.
 */
function toWriteError(error: {
  code?: string | null
  message?: string | null
}): BillingRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? 'sem mensagem'

  if (code === '23503') {
    return new BillingRepositoryError('not-found', message, code)
  }

  if (code === '42501' || code === 'PGRST301') {
    return new BillingRepositoryError('forbidden', message, code)
  }

  if (!code && /fetch|network|timeout|econnre/i.test(message)) {
    return new BillingRepositoryError('unavailable', message)
  }

  return new BillingRepositoryError('unexpected', message, code)
}

export type { PaymentMethod }
