import type {
  CashEntry,
  CashSession,
  FinanceSummary,
  Invoice,
  NewInvoiceData,
  NewPaymentData,
  OpenCashSession,
  Payable,
  NewPayableData,
  SettlePayableData,
  Payment,
} from './Billing'

/**
 * PORTA do financeiro — feature **B-01**.
 *
 * # O que NÃO está aqui, e por quê
 *
 * **Não há `issueInvoice`.** Emitir documento fiscal numerado exige
 * `next_document_number(p_kind)` e a RPC `issue_invoice` — e as duas estão fora
 * de alcance por motivos diferentes:
 *
 *  - `issue_invoice` aparece em `database.types.ts` como
 *    `Args: Record<string, unknown>`: o gerador **não conseguiu resolver a
 *    assinatura**. Chamá-la seria adivinhar nomes de parâmetro.
 *  - `next_document_number(p_kind: string)` é tipada, mas `document_sequences.kind`
 *    é texto livre e o valor válido não é legível daqui (bloqueio **B1**).
 *
 * Numeração fiscal que pula ou repete não é bug de tela: é problema com a
 * prefeitura. A fatia entrega a COBRANÇA, que é o que a recepção precisa no
 * balcão, e deixa a emissão explicitamente de fora — a tela diz isso.
 *
 * **Não há `delete` de fatura nem de pagamento.** Cancelar preserva a linha com
 * `canceled_at` e o motivo; estorno é assunto de quem tiver a RPC. Registro
 * financeiro apagado é registro que não serve de prova.
 *
 * Contas a pagar usam a tabela `payables` já existente no schema. O adapter
 * mantém a mesma regra de todas as escritas financeiras: sempre filtra a
 * clínica e nunca aceita do navegador o valor que será baixado.
 */
export interface BillingRepository {
  /** Cobranças encontradas pelo nome do paciente, para a busca global. */
  searchInvoicesByPatientName(
    clinicId: string,
    query: string,
    limit: number,
  ): Promise<Invoice[]>

  /** Despesas com vencimento até o limite informado, incluindo atrasadas. */
  listPayables(clinicId: string, through: Date): Promise<Payable[]>

  /** Registra uma despesa ainda não paga. */
  createPayable(
    clinicId: string,
    data: NewPayableData,
    createdBy: string,
  ): Promise<Payable>

  /** Baixa a despesa pelo valor que está persistido, sem valor vindo do cliente. */
  settlePayable(
    clinicId: string,
    data: SettlePayableData,
  ): Promise<Payable>

  /** Cobranças do período, mais recentes primeiro. */
  listInvoices(clinicId: string, from: Date, to: Date): Promise<Invoice[]>

  /** Resumo do período: recebido, em aberto, quantidades. */
  summary(clinicId: string, from: Date, to: Date): Promise<FinanceSummary>

  /**
   * Cria a cobrança com seus itens.
   *
   * **Os totais são calculados no servidor**, a partir de quantidade e preço
   * unitário. Nenhum valor total atravessa a fronteira vindo do cliente: quem
   * controla o total controla quanto o paciente deve.
   *
   * Nasce em `draft` — ver o cabeçalho desta porta sobre cobrar × emitir.
   */
  createInvoice(
    clinicId: string,
    data: NewInvoiceData,
    createdBy: string,
  ): Promise<Invoice>

  /**
   * Cancela a cobrança, sem apagar.
   *
   * Recusa cancelar o que já tem pagamento registrado: dinheiro que entrou não
   * desaparece porque a cobrança foi cancelada, e a linha ficaria mentindo.
   */
  cancelInvoice(
    clinicId: string,
    invoiceId: string,
    reason: string | null,
  ): Promise<Invoice>

  /**
   * Registra um pagamento.
   *
   * O adapter recusa valor acima do saldo devedor — pagamento maior que a dívida
   * é erro de digitação (R$ 1.000 no lugar de R$ 100), e aceitá-lo criaria um
   * crédito que o sistema não sabe devolver.
   *
   * Pagamento em espécie com caixa aberto entra também em `cash_entries`, para
   * que o fechamento do turno bata com a gaveta.
   */
  registerPayment(
    clinicId: string,
    data: NewPaymentData,
    receivedBy: string,
  ): Promise<Payment>

  /** A sessão de caixa aberta, com seus lançamentos. `null` se não houver. */
  currentCashSession(clinicId: string): Promise<OpenCashSession | null>

  /** Abre o turno. Recusa se já houver um aberto. */
  openCashSession(
    clinicId: string,
    openingAmountCents: number,
    openedBy: string,
  ): Promise<CashSession>

  /** Sangria ou suprimento. */
  addCashEntry(
    clinicId: string,
    sessionId: string,
    entry: {
      kind: 'in' | 'out'
      amountCents: number
      description: string
    },
    createdBy: string,
  ): Promise<CashEntry>

  /**
   * Fecha o turno com o valor contado.
   *
   * A diferença entre o esperado e o contado é gravada como está, inclusive
   * quando é negativa: caixa que só fecha certo não serve para descobrir nada.
   *
   * A RPC `close_cash_session` existe no schema e faria isto de forma atômica —
   * sua assinatura, porém, também é `Record<string, unknown>`. O adapter calcula
   * e grava direto, e o desvio está documentado lá.
   */
  closeCashSession(
    clinicId: string,
    sessionId: string,
    countedAmountCents: number,
    closedBy: string,
  ): Promise<CashSession>
}
